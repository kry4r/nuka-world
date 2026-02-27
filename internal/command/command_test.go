package command

import (
	"context"
	"testing"
)

func TestRegistryDispatch(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&Command{
		Name:        "ping",
		Description: "Ping test",
		Usage:       "/ping",
		Handler: func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			return &CommandResult{Content: "pong: " + args}, nil
		},
	})

	ctx := context.Background()
	cc := &CommandContext{Platform: "test"}

	// Test known command
	result, err := reg.Dispatch(ctx, "/ping hello", cc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Content != "pong: hello" {
		t.Errorf("got %q, want %q", result.Content, "pong: hello")
	}

	// Test unknown command
	result, err = reg.Dispatch(ctx, "/unknown", cc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Content == "" {
		t.Error("expected error message for unknown command")
	}
}

func TestRegistryList(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&Command{Name: "beta"})
	reg.Register(&Command{Name: "alpha"})

	list := reg.List()
	if len(list) != 2 {
		t.Fatalf("got %d commands, want 2", len(list))
	}
	if list[0].Name != "alpha" {
		t.Errorf("got %q first, want %q", list[0].Name, "alpha")
	}
}
