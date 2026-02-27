package config

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

// Config is the top-level configuration structure.
type Config struct {
	Server    ServerConfig     `json:"server"`
	Providers []ProviderConfig `json:"providers"`
	Gateway   GatewayConfig    `json:"gateway"`
	MCP       MCPConfig        `json:"mcp"`
	Database  DatabaseConfig   `json:"database"`
	Embedding EmbeddingConfig  `json:"embedding"`
	SkillsDir string           `json:"skills_dir"`
}

type ServerConfig struct {
	Port     int    `json:"port"`
	LogLevel string `json:"log_level"`
}

type ProviderConfig struct {
	ID       string            `json:"id"`
	Type     string            `json:"type"`
	Name     string            `json:"name"`
	Endpoint string            `json:"endpoint"`
	APIKey   string            `json:"api_key"`
	Models   []string          `json:"models,omitempty"`
	Extra    map[string]string `json:"extra,omitempty"`
}

type GatewayConfig struct {
	Slack   SlackGatewayConfig   `json:"slack"`
	Discord DiscordGatewayConfig `json:"discord"`
}

type SlackGatewayConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"bot_token"`
	AppToken string `json:"app_token"`
}

type DiscordGatewayConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"bot_token"`
}

type MCPConfig struct {
	Servers []MCPServerConfig `json:"servers"`
}

type MCPServerConfig struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

type DatabaseConfig struct {
	Postgres PostgresConfig `json:"postgres"`
	Neo4j    Neo4jConfig    `json:"neo4j"`
	Redis    RedisConfig    `json:"redis"`
	Qdrant   QdrantConfig   `json:"qdrant"`
}

type PostgresConfig struct {
	DSN string `json:"dsn"`
}

type Neo4jConfig struct {
	URI      string `json:"uri"`
	User     string `json:"user"`
	Password string `json:"password"`
}

type RedisConfig struct {
	URL string `json:"url"`
}

type EmbeddingConfig struct {
	Provider  string `json:"provider"`
	Endpoint  string `json:"endpoint"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key"`
	Dimension int    `json:"dimension"`
}

type QdrantConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// envVarRe matches ${VAR} and ${VAR:default} patterns.
var envVarRe = regexp.MustCompile(`\$\{(\w+)(?::([^}]*))?\}`)

// Load reads a JSON config file and substitutes environment variable references.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	// Substitute ${VAR} and ${VAR:default} with environment values.
	resolved := envVarRe.ReplaceAllStringFunc(string(data), func(match string) string {
		parts := envVarRe.FindStringSubmatch(match)
		name := parts[1]
		defaultVal := parts[2]
		if v := os.Getenv(name); v != "" {
			return v
		}
		return defaultVal
	})

	var cfg Config
	if err := json.Unmarshal([]byte(resolved), &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	return &cfg, nil
}
