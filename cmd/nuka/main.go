package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/api"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	"github.com/nidhogg/nuka-world/internal/provider"
	"github.com/nidhogg/nuka-world/internal/world"
	"go.uber.org/zap"
)

func main() {
	_ = godotenv.Load()

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	logger.Info("Starting Nuka World...")

	// Initialize provider router
	router := provider.NewRouter(logger)
	setupProviders(router, logger)

	// Initialize memory store
	store, err := initMemoryStore(logger)
	if err != nil {
		logger.Warn("Neo4j unavailable, running without memory", zap.Error(err))
	}

	// Initialize agent engine
	engine := agent.NewEngine(router, store, logger)

	// Initialize orchestrator
	var steward *orchestrator.Steward
	redisURL := envOr("REDIS_URL", "redis://localhost:6379")
	bus, busErr := orchestrator.NewMessageBus(redisURL, logger)
	if busErr != nil {
		logger.Warn("Redis unavailable, running without orchestrator", zap.Error(busErr))
	} else {
		scheduler := orchestrator.NewScheduler(engine, bus, 10, logger)
		steward = orchestrator.NewSteward("world-steward", engine, scheduler, logger)
		logger.Info("Orchestrator initialized")
	}

	// Initialize gateway
	gw := gateway.NewGateway(logger)
	restAdapter := gateway.NewRESTAdapter(logger)
	gw.Register(restAdapter)

	if slackBot := os.Getenv("SLACK_BOT_TOKEN"); slackBot != "" {
		slackApp := os.Getenv("SLACK_APP_TOKEN")
		slackAdapter := gateway.NewSlackAdapter(slackBot, slackApp, logger)
		gw.Register(slackAdapter)
	}

	if discordToken := os.Getenv("DISCORD_BOT_TOKEN"); discordToken != "" {
		discordAdapter := gateway.NewDiscordAdapter(discordToken, logger)
		gw.Register(discordAdapter)
	}

	broadcaster := gateway.NewBroadcaster(gw, logger)

	gwCtx := context.Background()
	if err := gw.ConnectAll(gwCtx); err != nil {
		logger.Warn("some gateway adapters failed to connect", zap.Error(err))
	}

	// Initialize world simulation
	clock := world.NewWorldClock(1*time.Second, 1.0, logger)
	scheduleMgr := world.NewScheduleManager(logger)
	stateMgr := world.NewStateManager(scheduleMgr, logger)
	growthTracker := world.NewGrowthTracker(logger)

	clock.AddListener(scheduleMgr)
	clock.AddListener(stateMgr)

	// RelationGraph requires Neo4j
	if store != nil {
		relationGraph := world.NewRelationGraph(store.Driver(), 0.001, logger)
		clock.AddListener(relationGraph)
		_ = relationGraph
	}

	// Heartbeat: triggers autonomous agent thinking and drains pending schedules
	heartbeatFn := func(ctx context.Context, agentID string) error {
		_, err := engine.Execute(ctx, agentID, "[heartbeat] 你现在有空闲时间，可以自主思考、回顾记忆、或规划接下来的活动。")
		return err
	}
	drainFn := func() []world.PendingSchedule {
		raw := engine.DrainSchedules()
		out := make([]world.PendingSchedule, len(raw))
		for i, r := range raw {
			out[i] = world.PendingSchedule{
				AgentID:   r.AgentID,
				Title:     r.Title,
				Type:      r.Type,
				StartTime: r.StartTime,
				Duration:  r.Duration,
				Recurring: r.Recurring,
			}
		}
		return out
	}
	listFn := func() []string {
		agents := engine.List()
		ids := make([]string, len(agents))
		for i, a := range agents {
			ids[i] = a.Persona.ID
		}
		return ids
	}
	heartbeat := world.NewHeartbeat(5*time.Minute, heartbeatFn, listFn, drainFn, scheduleMgr, logger)
	clock.AddListener(heartbeat)

	clock.Start()
	logger.Info("World simulation started")

	// Build HTTP handler
	handler := api.NewHandler(engine, store, steward, broadcaster, restAdapter, clock, scheduleMgr, stateMgr, growthTracker, heartbeat, logger)

	// Start server
	port := envOr("PORT", "8080")
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: handler.Router(),
	}

	go func() {
		logger.Info("Nuka World listening", zap.String("port", port))
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down Nuka World...")
	clock.Stop()
	ctx := context.Background()
	srv.Shutdown(ctx)
	if store != nil {
		store.Close(ctx)
	}
	if bus != nil {
		bus.Close()
	}
	gw.Close()
}

func setupProviders(router *provider.Router, logger *zap.Logger) {
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		p := provider.NewOpenAIProvider(provider.ProviderConfig{
			ID:       "openai",
			Type:     "openai",
			Name:     "OpenAI",
			APIKey:   key,
			Endpoint: envOr("OPENAI_ENDPOINT", "https://api.openai.com/v1"),
		}, logger)
		router.Register(p)
	}

	if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
		p := provider.NewAnthropicProvider(provider.ProviderConfig{
			ID:       "anthropic",
			Type:     "anthropic",
			Name:     "Anthropic",
			APIKey:   key,
			Endpoint: envOr("ANTHROPIC_ENDPOINT", "https://api.anthropic.com/v1"),
		}, logger)
		router.Register(p)
	}
}

func initMemoryStore(logger *zap.Logger) (*memory.Store, error) {
	uri := envOr("NEO4J_URI", "bolt://localhost:7687")
	user := envOr("NEO4J_USER", "neo4j")
	pass := envOr("NEO4J_PASSWORD", "")
	return memory.NewStore(uri, user, pass, logger)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
