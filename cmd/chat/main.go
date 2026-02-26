package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	server := flag.String("server", "http://localhost:3210", "Nuka World server URL")
	user := flag.String("user", "cli-user", "User name for chat")
	flag.Parse()

	fmt.Println("Nuka World CLI Chat")
	fmt.Printf("Server: %s | User: %s\n", *server, *user)
	fmt.Println("Type 'exit' or 'quit' to leave. Use @AgentName or @team-Name to route.")
	fmt.Println("Commands: /status, /agents")
	fmt.Println("---")

	fetchAgents(*server)

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("\n> ")
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}
		if input == "exit" || input == "quit" {
			fmt.Println("Bye!")
			return
		}
		if input == "/status" {
			fetchStatus(*server)
			continue
		}
		if input == "/agents" {
			fetchAgents(*server)
			continue
		}

		sendMessage(*server, *user, input)
	}
}

func fetchAgents(server string) {
	resp, err := http.Get(server + "/api/agents")
	if err != nil {
		printError("Failed to fetch agents: %v", err)
		return
	}
	defer resp.Body.Close()

	var agents []struct {
		Persona struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Role string `json:"role"`
		} `json:"persona"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		printError("Failed to parse agents: %v", err)
		return
	}
	if len(agents) == 0 {
		fmt.Println("No agents registered yet.")
		return
	}
	fmt.Println("Available agents:")
	for _, a := range agents {
		fmt.Printf("  @%s (%s)\n", a.Persona.Name, a.Persona.Role)
	}
}

func fetchStatus(server string) {
	resp, err := http.Get(server + "/api/gateway/status")
	if err != nil {
		printError("Failed to fetch status: %v", err)
		return
	}
	defer resp.Body.Close()

	var statuses []struct {
		Platform    string  `json:"platform"`
		Connected   bool    `json:"connected"`
		ConnectedAt *string `json:"connected_at,omitempty"`
		Error       string  `json:"error,omitempty"`
		Details     string  `json:"details,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&statuses); err != nil {
		printError("Failed to parse status: %v", err)
		return
	}
	fmt.Println("Gateway Status:")
	for _, s := range statuses {
		icon := "\033[31m✗\033[0m"
		if s.Connected {
			icon = "\033[32m✓\033[0m"
		}
		fmt.Printf("  %s %s", icon, s.Platform)
		if s.Details != "" {
			fmt.Printf(" — %s", s.Details)
		}
		if s.Error != "" {
			fmt.Printf(" \033[31m(%s)\033[0m", s.Error)
		}
		fmt.Println()
	}
}

func sendMessage(server, user, content string) {
	body, _ := json.Marshal(map[string]string{
		"user_id":   user,
		"user_name": user,
		"content":   content,
	})

	client := &http.Client{Timeout: 65 * time.Second}
	resp, err := client.Post(
		server+"/api/gateway/rest/message",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		printError("Request failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		printError("Server error (%d): %s", resp.StatusCode, string(data))
		return
	}

	var msg struct {
		AgentID string `json:"agent_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&msg); err != nil {
		printError("Failed to parse response: %v", err)
		return
	}

	if msg.AgentID != "" {
		fmt.Printf("\033[36m[%s]\033[0m %s\n", msg.AgentID, msg.Content)
	} else {
		fmt.Println(msg.Content)
	}
}

func printError(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "\033[31m"+format+"\033[0m\n", args...)
}
