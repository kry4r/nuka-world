package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/provider"
	"go.uber.org/zap"
)

// Steward is the World Steward — the main agent that receives all
// external messages, decomposes tasks, and dispatches to team members.
type Steward struct {
	agentID   string
	engine    *agent.Engine
	scheduler *Scheduler
	teams     map[string]*Team
	logger    *zap.Logger
}

// Intent represents a parsed user intent.
type Intent struct {
	Action      string   `json:"action"`
	Targets     []string `json:"targets"`
	Description string   `json:"description"`
}

// DecomposedTask is a sub-task extracted from user intent.
type DecomposedTask struct {
	Role        string `json:"role"`
	Instruction string `json:"instruction"`
}

// StewardResult is the aggregated output from the steward.
type StewardResult struct {
	Intent   *Intent       `json:"intent"`
	Tasks    []*TaskResult `json:"tasks"`
	Summary  string        `json:"summary"`
	Duration time.Duration `json:"duration"`
}

// NewSteward creates the World Steward.
func NewSteward(agentID string, engine *agent.Engine, scheduler *Scheduler, logger *zap.Logger) *Steward {
	return &Steward{
		agentID:   agentID,
		engine:    engine,
		scheduler: scheduler,
		teams:     make(map[string]*Team),
		logger:    logger,
	}
}

// ListTeams returns all registered teams.
func (s *Steward) ListTeams() []*Team {
	teams := make([]*Team, 0, len(s.teams))
	for _, t := range s.teams {
		teams = append(teams, t)
	}
	return teams
}

// RegisterTeam adds a team under the steward's management.
func (s *Steward) RegisterTeam(team *Team) {
	if team.ID == "" {
		team.ID = uuid.New().String()
	}
	team.StewardID = s.agentID
	team.CreatedAt = time.Now()
	s.teams[team.ID] = team
	s.logger.Info("registered team",
		zap.String("team", team.Name),
		zap.Int("members", len(team.Members)))
}

// Handle processes an incoming user message through the full steward pipeline:
// intent recognition → task decomposition → dispatch → aggregation.
func (s *Steward) Handle(ctx context.Context, teamID string, userMsg string) (*StewardResult, error) {
	start := time.Now()

	team, ok := s.teams[teamID]
	if !ok {
		return nil, fmt.Errorf("team %s not found", teamID)
	}

	// Step 1: Use LLM to identify intent and decompose tasks
	decomposed, intent, err := s.decompose(ctx, team, userMsg)
	if err != nil {
		return nil, fmt.Errorf("decompose: %w", err)
	}

	s.logger.Info("decomposed user intent",
		zap.String("action", intent.Action),
		zap.Int("subtasks", len(decomposed)))

	// Step 2: If single task or no decomposition, handle directly
	if len(decomposed) == 0 {
		result, err := s.engine.Execute(ctx, s.agentID, userMsg)
		if err != nil {
			return nil, err
		}
		return &StewardResult{
			Intent:   intent,
			Summary:  result.Content,
			Duration: time.Since(start),
		}, nil
	}

	// Step 3: Build tasks and dispatch in parallel
	tasks := make([]*Task, len(decomposed))
	for i, d := range decomposed {
		tasks[i] = &Task{
			StepID: d.Role,
			Input:  d.Instruction,
		}
	}

	resultCh := s.scheduler.Dispatch(ctx, team, tasks)

	// Step 4: Collect results
	var results []*TaskResult
	for r := range resultCh {
		results = append(results, r)
	}

	// Step 5: Aggregate results into summary
	summary, err := s.aggregate(ctx, intent, results)
	if err != nil {
		summary = s.fallbackAggregate(results)
	}

	return &StewardResult{
		Intent:   intent,
		Tasks:    results,
		Summary:  summary,
		Duration: time.Since(start),
	}, nil
}

// decompose uses the steward's LLM to parse intent and break into sub-tasks.
func (s *Steward) decompose(ctx context.Context, team *Team, userMsg string) ([]DecomposedTask, *Intent, error) {
	// Build role list for the prompt
	var roles []string
	for _, m := range team.Members {
		roles = append(roles, m.Role)
	}

	prompt := fmt.Sprintf(`你是世界管家。分析用户消息，识别意图并拆解为子任务。
可用角色: %v

用户消息: %s

以JSON格式回复:
{"intent":{"action":"...","targets":[...],"description":"..."},"tasks":[{"role":"...","instruction":"..."}]}

如果任务简单无需拆解，返回空tasks数组。`, roles, userMsg)

	req := &provider.ChatRequest{
		Model: "default",
		Messages: []provider.Message{
			{Role: "user", Content: prompt},
		},
		MaxTokens: 1024,
	}

	resp, err := s.engine.RouteRaw(ctx, s.agentID, req)
	if err != nil {
		return nil, &Intent{Action: "direct", Description: userMsg}, nil
	}

	// Parse LLM response
	var parsed struct {
		Intent Intent           `json:"intent"`
		Tasks  []DecomposedTask `json:"tasks"`
	}
	if err := json.Unmarshal([]byte(resp.Content), &parsed); err != nil {
		// Fallback: treat as direct message
		return nil, &Intent{Action: "direct", Description: userMsg}, nil
	}

	return parsed.Tasks, &parsed.Intent, nil
}

// aggregate uses the LLM to synthesize task results into a coherent summary.
func (s *Steward) aggregate(ctx context.Context, intent *Intent, results []*TaskResult) (string, error) {
	var parts []string
	for _, r := range results {
		if r.Status == TaskDone {
			parts = append(parts, fmt.Sprintf("[%s]: %s", r.AgentID, r.Output))
		} else {
			parts = append(parts, fmt.Sprintf("[%s]: 失败 - %s", r.AgentID, r.Error))
		}
	}

	prompt := fmt.Sprintf(`你是世界管家。请将以下子任务结果汇总为一个连贯的回复。

用户意图: %s
子任务结果:
%s

请用简洁的语言汇总所有结果。`, intent.Description, strings.Join(parts, "\n"))

	req := &provider.ChatRequest{
		Model: "default",
		Messages: []provider.Message{
			{Role: "user", Content: prompt},
		},
		MaxTokens: 2048,
	}

	resp, err := s.engine.RouteRaw(ctx, s.agentID, req)
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

// fallbackAggregate concatenates results when LLM aggregation fails.
func (s *Steward) fallbackAggregate(results []*TaskResult) string {
	var buf strings.Builder
	for i, r := range results {
		if i > 0 {
			buf.WriteString("\n---\n")
		}
		if r.Status == TaskDone {
			buf.WriteString(r.Output)
		} else {
			fmt.Fprintf(&buf, "任务失败: %s", r.Error)
		}
	}
	return buf.String()
}