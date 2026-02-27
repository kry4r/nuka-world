package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/api"
	"github.com/nidhogg/nuka-world/internal/command"
	"github.com/nidhogg/nuka-world/internal/config"
	"github.com/nidhogg/nuka-world/internal/embedding"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/mcp"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	"github.com/nidhogg/nuka-world/internal/provider"
	"github.com/nidhogg/nuka-world/internal/rag"
	msgrouter "github.com/nidhogg/nuka-world/internal/router"
	"github.com/nidhogg/nuka-world/internal/skill"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
	"github.com/nidhogg/nuka-world/internal/vectorstore"
	"github.com/nidhogg/nuka-world/internal/world"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// Adapters — bridge concrete types to command package interfaces.
// ---------------------------------------------------------------------------

// agentListerAdapter adapts *agent.Engine to command.AgentLister.
type agentListerAdapter struct{ e *agent.Engine }

func (a *agentListerAdapter) List() []command.AgentInfo {
	agents := a.e.List()
	out := make([]command.AgentInfo, len(agents))
	for i, ag := range agents {
		out[i] = command.AgentInfo{
			ID:     ag.Persona.ID,
			Name:   ag.Persona.Name,
			Role:   ag.Persona.Role,
			Status: string(ag.Status),
		}
	}
	return out
}

// mcpListerAdapter adapts []*mcp.Client to command.MCPLister.
type mcpListerAdapter struct{ clients []*mcp.Client }

func (a *mcpListerAdapter) ListTools() []command.ToolInfo {
	var out []command.ToolInfo
	for _, c := range a.clients {
		for _, t := range c.ListTools() {
			out = append(out, command.ToolInfo{
				ServerName: c.Name(),
				ToolName:   t.Name,
			})
		}
	}
	return out
}

// statusAdapter adapts *gateway.Gateway to command.StatusProvider.
type statusAdapter struct{ gw *gateway.Gateway }

func (a *statusAdapter) StatusAll() []command.AdapterStatus {
	raw := a.gw.StatusAll()
	out := make([]command.AdapterStatus, len(raw))
	for i, s := range raw {
		out[i] = command.AdapterStatus{
			Name:      s.Platform,
			Platform:  s.Platform,
			Connected: s.Connected,
		}
	}
	return out
}

// skillListerAdapter adapts *skill.Manager to command.SkillLister.
type skillListerAdapter struct{ mgr *skill.Manager }

func (a *skillListerAdapter) ListSkills() []command.SkillInfo {
	skills := a.mgr.All()
	out := make([]command.SkillInfo, len(skills))
	for i, s := range skills {
		out[i] = command.SkillInfo{
			Name:        s.Name,
			Description: s.Description,
			Source:      s.Source,
		}
	}
	return out
}

// ragSearchAdapter adapts *rag.Orchestrator to command.RAGSearcher.
type ragSearchAdapter struct{ o *rag.Orchestrator }

func (a *ragSearchAdapter) Query(ctx context.Context, agentID, query string, topK int) ([]command.RAGSearchResult, error) {
	results, err := a.o.Query(ctx, agentID, query, topK)
	if err != nil {
		return nil, err
	}
	out := make([]command.RAGSearchResult, len(results))
	for i, r := range results {
		out[i] = command.RAGSearchResult{
			Content: r.Content,
			Source:  r.Source,
			Score:   r.Score,
		}
	}
	return out, nil
}

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

	// Seed default World agent if none registered
	if len(engine.List()) == 0 {
		defaultProvider := os.Getenv("DEFAULT_PROVIDER_ID")
		if defaultProvider == "" {
			defaultProvider = "xfyun"
		}
		defaultModel := os.Getenv("DEFAULT_MODEL")
		if defaultModel == "" {
			defaultModel = "xminimaxm25"
		}
		engine.Register(&agent.Agent{
			Persona: agent.Persona{
				ID:   "world",
				Name: "World",
				Role: "主管理员",
				Personality: "友善、博学、乐于助人的AI助手，负责管理和协调Nuka World中的一切事务",
				SystemPrompt: "你是 Nuka World 的主管理员 World。你负责回答用户的问题、管理世界中的事务、协调其他Agent的工作。" +
					"你应该友善、专业地回应所有消息。如果用户的请求超出你的能力范围，请诚实告知。",
			},
			ProviderID: defaultProvider,
			Model:      defaultModel,
		})
		logger.Info("Seeded default World agent",
			zap.String("provider", defaultProvider),
			zap.String("model", defaultModel))
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

	// --- Skill Manager ---
	skillMgr := skill.NewManager()
	skill.RegisterBuiltins(skillMgr)
	if cfg.SkillsDir != "" {
		plugins, loadErr := skill.LoadFromDir(cfg.SkillsDir)
		if loadErr != nil {
			logger.Warn("failed to load plugin skills", zap.Error(loadErr))
		} else {
			for _, s := range plugins {
				skillMgr.Add(s)
			}
			logger.Info("Loaded plugin skills", zap.Int("count", len(plugins)))
		}
	}
	engine.SetSkillManager(skillMgr)
	// Auto-assign default skills to world agent
	skillMgr.AssignSkill("world", "web_search")
	skillMgr.AssignSkill("world", "world_observer")
	skillMgr.AssignSkill("world", "memory_recall")

	// --- Embedding + Qdrant + RAG ---
	var ragOrch *rag.Orchestrator
	if cfg.Embedding.Endpoint != "" {
		embCfg := embedding.Config{
			Provider:  cfg.Embedding.Provider,
			Endpoint:  cfg.Embedding.Endpoint,
			Model:     cfg.Embedding.Model,
			APIKey:    cfg.Embedding.APIKey,
			Dimension: cfg.Embedding.Dimension,
		}
		var embedder embedding.Provider
		switch cfg.Embedding.Provider {
		case "local":
			embedder = embedding.NewLocalProvider(embCfg)
		default:
			embedder = embedding.NewAPIProvider(embCfg)
		}

		if cfg.Database.Qdrant.Host != "" {
			qClient, qErr := vectorstore.NewClient(vectorstore.QdrantConfig{
				Host: cfg.Database.Qdrant.Host,
				Port: cfg.Database.Qdrant.Port,
			})
			if qErr != nil {
				logger.Warn("Qdrant unavailable, running without RAG", zap.Error(qErr))
			} else {
				ragOrch = rag.NewOrchestrator(embedder, qClient, logger)
				if initErr := ragOrch.InitCollections(context.Background()); initErr != nil {
					logger.Warn("RAG collection init failed", zap.Error(initErr))
				}
				engine.SetRAG(rag.NewProviderAdapter(ragOrch))
				logger.Info("RAG initialized")
			}
		}
	}

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
	cmdRegistry := command.NewRegistry()
	command.RegisterBuiltins(cmdRegistry,
		&agentListerAdapter{e: engine},
		&mcpListerAdapter{clients: mcpClients},
		&statusAdapter{gw: gw},
		&skillListerAdapter{mgr: skillMgr},
	)
	command.RegisterCreateCommands(cmdRegistry,
		func(id, name, personality, systemPrompt string) string {
			a := &agent.Agent{
				Persona: agent.Persona{
					ID:           id,
					Name:         name,
					Personality:  personality,
					SystemPrompt: systemPrompt,
				},
			}
			engine.Register(a)
			return a.Persona.ID
		},
		func(ctx context.Context, agentID, name, description string) (string, error) {
			s := &skill.Skill{
				ID:          name,
				Name:        name,
				Description: description,
				Source:      "user",
			}
			skillMgr.Add(s)
			skillMgr.AssignSkill(agentID, s.ID)
			return s.ID, nil
		},
	)
	if ragOrch != nil {
		command.RegisterSearchCommand(cmdRegistry, &ragSearchAdapter{o: ragOrch})
	}
	msgRouter := msgrouter.New(engine, gw, steward, pgStore, cmdRegistry, logger)
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

