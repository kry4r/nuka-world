package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	"github.com/nidhogg/nuka-world/internal/world"
	"go.uber.org/zap"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	engine      *agent.Engine
	memoryStore *memory.Store
	steward     *orchestrator.Steward
	broadcaster *gateway.Broadcaster
	restGW      *gateway.RESTAdapter
	gw          *gateway.Gateway
	clock       *world.WorldClock
	scheduleMgr *world.ScheduleManager
	stateMgr    *world.StateManager
	growth      *world.GrowthTracker
	heartbeat   *world.Heartbeat
	logger      *zap.Logger
	providers   []ProviderConfig
	provMu      sync.Mutex
	skills      []SkillConfig
	skillMu     sync.Mutex
	adapters    []AdapterConfig
	adapterMu   sync.Mutex
}

// ProviderConfig represents an LLM provider configuration.
type ProviderConfig struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Endpoint string   `json:"endpoint"`
	APIKey   string   `json:"api_key"`
	Models   []string `json:"models"`
}

// SkillConfig represents a skill or MCP tool configuration.
type SkillConfig struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Endpoint    string `json:"endpoint,omitempty"`
	Command     string `json:"command,omitempty"`
	Status      string `json:"status"`
}

// AdapterConfig represents a gateway adapter configuration.
type AdapterConfig struct {
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	Status    string            `json:"status"`
	Settings  map[string]string `json:"settings"`
}

// NewHandler creates a new API handler.
func NewHandler(
	engine *agent.Engine,
	store *memory.Store,
	steward *orchestrator.Steward,
	broadcaster *gateway.Broadcaster,
	restGW *gateway.RESTAdapter,
	gw *gateway.Gateway,
	clock *world.WorldClock,
	scheduleMgr *world.ScheduleManager,
	stateMgr *world.StateManager,
	growth *world.GrowthTracker,
	heartbeat *world.Heartbeat,
	logger *zap.Logger,
) *Handler {
	return &Handler{
		engine:      engine,
		memoryStore: store,
		steward:     steward,
		broadcaster: broadcaster,
		restGW:      restGW,
		gw:          gw,
		clock:       clock,
		scheduleMgr: scheduleMgr,
		stateMgr:    stateMgr,
		growth:      growth,
		heartbeat:   heartbeat,
		logger:      logger,
	}
}

// Router builds the chi router with all routes.
func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", h.healthCheck)
		r.Get("/agents", h.listAgents)
		r.Post("/agents", h.createAgent)
		r.Get("/agents/{id}", h.getAgent)
		r.Post("/agents/{id}/chat", h.chatWithAgent)

		// Orchestrator routes
		r.Post("/teams", h.createTeam)
		r.Get("/teams", h.listTeams)
		r.Post("/teams/{teamID}/chat", h.chatWithTeam)

		// Gateway routes
		r.Post("/broadcast", h.sendBroadcast)
		r.Mount("/gateway/rest", h.restGW.Routes())
		r.Get("/adapters", h.listAdapters)
		r.Post("/adapters", h.saveAdapter)
		r.Get("/gateway/status", h.gatewayStatus)

		// Provider routes
		r.Get("/providers", h.listProviders)
		r.Post("/providers", h.addProvider)

		// Skill / Tool routes
		r.Get("/skills", h.listSkills)
		r.Post("/skills", h.addSkill)
		r.Delete("/skills/{name}", h.removeSkill)

		// World simulation routes
		r.Get("/agents/{id}/schedule", h.getAgentSchedule)
		r.Post("/agents/{id}/schedule", h.createAgentSchedule)
		r.Get("/agents/{id}/growth", h.getAgentGrowth)
		r.Get("/agents/{id}/state", h.getAgentState)
		r.Get("/world/status", h.worldStatus)
		r.Post("/heartbeat", h.triggerHeartbeat)
	})

	return r
}

func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "world": "nuka"})
}

func (h *Handler) listAgents(w http.ResponseWriter, r *http.Request) {
	agents := h.engine.List()
	writeJSON(w, http.StatusOK, agents)
}

func (h *Handler) createAgent(w http.ResponseWriter, r *http.Request) {
	var a agent.Agent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.engine.Register(&a)
	writeJSON(w, http.StatusCreated, a)
}

func (h *Handler) getAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a, ok := h.engine.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
		return
	}
	writeJSON(w, http.StatusOK, a)
}

type chatRequest struct {
	Message string `json:"message"`
}

func (h *Handler) chatWithAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := h.engine.Execute(r.Context(), id, req.Message)
	if err != nil {
		status := http.StatusInternalServerError
		if err == agent.ErrAgentNotFound {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) worldStatus(w http.ResponseWriter, r *http.Request) {
	agents := h.engine.List()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"world":       "Nuka World",
		"world_time":  h.clock.WorldTime(),
		"agent_count": len(agents),
		"agents":      agents,
	})
}

func (h *Handler) createTeam(w http.ResponseWriter, r *http.Request) {
	var team orchestrator.Team
	if err := json.NewDecoder(r.Body).Decode(&team); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if h.steward == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "orchestrator not initialized"})
		return
	}
	h.steward.RegisterTeam(&team)
	writeJSON(w, http.StatusCreated, team)
}

func (h *Handler) listTeams(w http.ResponseWriter, r *http.Request) {
	if h.steward == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "orchestrator not initialized"})
		return
	}
	teams := h.steward.ListTeams()
	writeJSON(w, http.StatusOK, teams)
}

type teamChatRequest struct {
	Message string `json:"message"`
}

func (h *Handler) chatWithTeam(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	var req teamChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if h.steward == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "orchestrator not initialized"})
		return
	}
	result, err := h.steward.Handle(r.Context(), teamID, req.Message)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) sendBroadcast(w http.ResponseWriter, r *http.Request) {
	var msg gateway.BroadcastMessage
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if msg.Type == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "type is required"})
		return
	}
	if err := h.broadcaster.Send(r.Context(), &msg); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "broadcast sent"})
}

func (h *Handler) getAgentSchedule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sched := h.scheduleMgr.GetSchedule(id)
	writeJSON(w, http.StatusOK, sched)
}

func (h *Handler) getAgentGrowth(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	profile := h.growth.GetProfile(id)
	writeJSON(w, http.StatusOK, profile)
}

func (h *Handler) getAgentState(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	state := h.stateMgr.GetState(id)
	writeJSON(w, http.StatusOK, map[string]string{
		"agent_id": id,
		"state":    string(state),
	})
}

type scheduleCreateRequest struct {
	Title     string  `json:"title"`
	Type      string  `json:"type"`
	DelayMin  float64 `json:"delay_min"`
	Duration  float64 `json:"duration"`
	Recurring string  `json:"recurring,omitempty"`
}

func (h *Handler) createAgentSchedule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, ok := h.engine.Get(id); !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
		return
	}

	var req scheduleCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Title == "" || req.Type == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title and type are required"})
		return
	}
	if req.Duration == 0 {
		req.Duration = 30
	}
	if req.DelayMin == 0 {
		req.DelayMin = 1
	}

	entry := world.ScheduleEntry{
		Type:      world.ActivityType(req.Type),
		Title:     req.Title,
		StartTime: time.Now().Add(time.Duration(req.DelayMin) * time.Minute),
		Duration:  time.Duration(req.Duration) * time.Minute,
		Recurring: req.Recurring,
	}
	entryID := h.scheduleMgr.AddEntry(id, entry)
	writeJSON(w, http.StatusCreated, map[string]string{
		"id":       entryID,
		"agent_id": id,
		"title":    req.Title,
		"status":   "scheduled",
	})
}

func (h *Handler) triggerHeartbeat(w http.ResponseWriter, r *http.Request) {
	if h.heartbeat == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "heartbeat not initialized"})
		return
	}
	fired := h.heartbeat.FireNow()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "heartbeat triggered",
		"agents_fired": fired,
		"world_time":   h.clock.WorldTime().Format(time.RFC3339),
	})
}

func (h *Handler) listProviders(w http.ResponseWriter, r *http.Request) {
	h.provMu.Lock()
	defer h.provMu.Unlock()
	writeJSON(w, http.StatusOK, h.providers)
}

func (h *Handler) addProvider(w http.ResponseWriter, r *http.Request) {
	var p ProviderConfig
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if p.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if p.ID == "" {
		p.ID = p.Name
	}
	h.provMu.Lock()
	h.providers = append(h.providers, p)
	h.provMu.Unlock()
	writeJSON(w, http.StatusCreated, p)
}

func (h *Handler) listSkills(w http.ResponseWriter, r *http.Request) {
	h.skillMu.Lock()
	defer h.skillMu.Unlock()
	writeJSON(w, http.StatusOK, h.skills)
}

func (h *Handler) addSkill(w http.ResponseWriter, r *http.Request) {
	var s SkillConfig
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if s.Name == "" || s.Type == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and type are required"})
		return
	}
	if s.Status == "" {
		s.Status = "active"
	}
	h.skillMu.Lock()
	h.skills = append(h.skills, s)
	h.skillMu.Unlock()
	writeJSON(w, http.StatusCreated, s)
}

func (h *Handler) removeSkill(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	h.skillMu.Lock()
	defer h.skillMu.Unlock()
	for i, s := range h.skills {
		if s.Name == name {
			h.skills = append(h.skills[:i], h.skills[i+1:]...)
			writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "skill not found"})
}

func (h *Handler) listAdapters(w http.ResponseWriter, r *http.Request) {
	h.adapterMu.Lock()
	defer h.adapterMu.Unlock()
	writeJSON(w, http.StatusOK, h.adapters)
}

func (h *Handler) saveAdapter(w http.ResponseWriter, r *http.Request) {
	var a AdapterConfig
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if a.Name == "" || a.Type == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and type are required"})
		return
	}
	if a.Status == "" {
		a.Status = "configured"
	}
	h.adapterMu.Lock()
	// upsert by name
	found := false
	for i, existing := range h.adapters {
		if existing.Name == a.Name {
			h.adapters[i] = a
			found = true
			break
		}
	}
	if !found {
		h.adapters = append(h.adapters, a)
	}
	h.adapterMu.Unlock()
	writeJSON(w, http.StatusOK, a)
}

func (h *Handler) gatewayStatus(w http.ResponseWriter, r *http.Request) {
	if h.gw == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "gateway not initialized"})
		return
	}
	statuses := h.gw.StatusAll()
	writeJSON(w, http.StatusOK, statuses)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
