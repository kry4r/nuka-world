package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fmt"

	"github.com/joho/godotenv"
	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/api"
	"github.com/nidhogg/nuka-world/internal/config"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/mcp"
	"github.com/nidhogg/nuka-world/internal/memory"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	msgrouter "github.com/nidhogg/nuka-world/internal/router"
	"github.com/nidhogg/nuka-world/internal/provider"
	"github.com/nidhogg/nuka-world/internal/world"
	"go.uber.org/zap"
)

func main() {
	_ = godotenv.Load()

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	logger.Info("Starting Nuka World...")

	// Load configuration
	cfgPath := os.Getenv("CONFIG_PATH")
	if cfgPath == "" {
		cfgPath = "configs/nuka.json"
	}
	cfg, err := config.Load(cfgPath)
	if err != nil {
		logger.Fatal("failed to load config", zap.String("path", cfgPath), zap.Error(err))
	}
	logger.Info("Config loaded", zap.String("path", cfgPath))

	// Initialize provider router
	router := provider.NewRouter(logger)
	for _, pc := range cfg.Providers {
		provCfg := provider.ProviderConfig{
			ID: pc.ID, Type: pc.Type, Name: pc.Name,
			Endpoint: pc.Endpoint, APIKey: pc.APIKey,
			Models: pc.Models, Extra: pc.Extra,
		}
		switch pc.Type {
		case "openai":
			router.Register(provider.NewOpenAIProvider(provCfg, logger))
		case "anthropic":
			router.Register(provider.NewAnthropicProvider(provCfg, logger))
		default:
			logger.Warn("unknown provider type", zap.String("id", pc.ID), zap.String("type", pc.Type))
		}
	}

	// Initialize memory store
	store, err := memory.NewStore(cfg.Database.Neo4j.URI, cfg.Database.Neo4j.User, cfg.Database.Neo4j.Password, logger)
	if err != nil {
		logger.Warn("Neo4j unavailable, running without memory", zap.Error(err))
	}

	// Initialize PostgreSQL store
	var pgStore *pgstore.Store
	if cfg.Database.Postgres.DSN != "" {
		ps, pgErr := pgstore.New(cfg.Database.Postgres.DSN, logger)
		if pgErr != nil {
			logger.Warn("PostgreSQL unavailable, running without persistence", zap.Error(pgErr))
		} else {
			if mErr := ps.Migrate(context.Background(), "migrations"); mErr != nil {
				logger.Fatal("migration failed", zap.Error(mErr))
			}
			pgStore = ps
		}
	}

	// Initialize agent engine
	engine := agent.NewEngine(router, store, logger)
	if pgStore != nil {
		engine.SetPersister(pgStore)
		// Load persisted agents
		agents, loadErr := pgStore.ListAgents(context.Background())
		if loadErr != nil {
			logger.Warn("failed to load agents from DB", zap.Error(loadErr))
		} else {
			for _, a := range agents {
				engine.Register(a)
			}
			logger.Info("Loaded agents from DB", zap.Int("count", len(agents)))
		}
	}

	// Initialize MCP clients
	var mcpClients []*mcp.Client
	for _, sc := range cfg.MCP.Servers {
		c := mcp.NewClient(sc.Name, sc.URL, logger)
		if err := c.Connect(context.Background()); err != nil {
			logger.Warn("MCP server unavailable", zap.String("name", sc.Name), zap.Error(err))
			continue
		}
		mcpClients = append(mcpClients, c)
	}
	agent.RegisterMCPTools(engine.Tools(), mcpClients)

	// Initialize orchestrator
	var steward *orchestrator.Steward
	bus, busErr := orchestrator.NewMessageBus(cfg.Database.Redis.URL, logger)
	if busErr != nil {
		logger.Warn("Redis unavailable, running without orchestrator", zap.Error(busErr))
	} else {
		scheduler := orchestrator.NewScheduler(engine, bus, 10, logger)
		steward = orchestrator.NewSteward("world-steward", engine, scheduler, logger)
		logger.Info("Orchestrator initialized")
	}

	// Initialize gateway
	gw := gateway.NewGateway(logger)

	// Wire message router BEFORE registering adapters (Register captures handler)
	msgRouter := msgrouter.New(engine, gw, steward, pgStore, logger)
	gw.SetHandler(msgRouter.Handle)

	restAdapter := gateway.NewRESTAdapter(logger)
	gw.Register(restAdapter)

	if cfg.Gateway.Slack.Enabled && cfg.Gateway.Slack.BotToken != "" {
		slackAdapter := gateway.NewSlackAdapter(cfg.Gateway.Slack.BotToken, cfg.Gateway.Slack.AppToken, logger)
		gw.Register(slackAdapter)
	}

	if cfg.Gateway.Discord.Enabled && cfg.Gateway.Discord.BotToken != "" {
		discordAdapter := gateway.NewDiscordAdapter(cfg.Gateway.Discord.BotToken, logger)
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
	handler := api.NewHandler(engine, store, steward, broadcaster, restAdapter, gw, clock, scheduleMgr, stateMgr, growthTracker, heartbeat, logger)

	// Start server
	port := fmt.Sprintf("%d", cfg.Server.Port)
	if port == "0" {
		port = "8080"
	}
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
	if pgStore != nil {
		pgStore.Close()
	}
	for _, mc := range mcpClients {
		mc.Close()
	}
	gw.Close()
}

