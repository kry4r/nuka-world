package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"
)

// ProviderRow represents a provider record in the database.
type ProviderRow struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	Endpoint  string            `json:"endpoint"`
	APIKey    string            `json:"api_key"` // plaintext in memory, encrypted in DB
	Models    []string          `json:"models"`
	Extra     map[string]string `json:"extra"`
	IsDefault bool              `json:"is_default"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

// encryptKey returns the 32-byte AES key from NUKA_ENCRYPT_KEY env var.
func encryptKey() ([]byte, error) {
	keyHex := os.Getenv("NUKA_ENCRYPT_KEY")
	if keyHex == "" {
		return nil, fmt.Errorf("NUKA_ENCRYPT_KEY not set")
	}
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("decode NUKA_ENCRYPT_KEY: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("NUKA_ENCRYPT_KEY must be 64 hex chars (32 bytes), got %d bytes", len(key))
	}
	return key, nil
}

// encrypt uses AES-256-GCM to encrypt plaintext.
func encrypt(plaintext string) ([]byte, error) {
	key, err := encryptKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}
	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// decrypt uses AES-256-GCM to decrypt ciphertext.
func decrypt(ciphertext []byte) (string, error) {
	if len(ciphertext) == 0 {
		return "", nil
	}
	key, err := encryptKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}

// SaveProvider inserts a new provider with encrypted API key.
func (s *Store) SaveProvider(ctx context.Context, p *ProviderRow) error {
	encKey, err := encrypt(p.APIKey)
	if err != nil {
		return fmt.Errorf("encrypt api_key: %w", err)
	}
	modelsJSON, _ := json.Marshal(p.Models)
	extraJSON, _ := json.Marshal(p.Extra)

	_, err = s.db.Exec(ctx,
		`INSERT INTO providers (name, type, endpoint, api_key_enc, models, extra, is_default)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		p.Name, p.Type, p.Endpoint, encKey, modelsJSON, extraJSON, p.IsDefault,
	)
	if err != nil {
		return fmt.Errorf("insert provider: %w", err)
	}
	return nil
}

// UpdateProvider updates an existing provider.
func (s *Store) UpdateProvider(ctx context.Context, p *ProviderRow) error {
	encKey, err := encrypt(p.APIKey)
	if err != nil {
		return fmt.Errorf("encrypt api_key: %w", err)
	}
	modelsJSON, _ := json.Marshal(p.Models)
	extraJSON, _ := json.Marshal(p.Extra)

	_, err = s.db.Exec(ctx,
		`UPDATE providers SET name=$1, type=$2, endpoint=$3, api_key_enc=$4,
		 models=$5, extra=$6, updated_at=NOW() WHERE id=$7`,
		p.Name, p.Type, p.Endpoint, encKey, modelsJSON, extraJSON, p.ID,
	)
	if err != nil {
		return fmt.Errorf("update provider: %w", err)
	}
	return nil
}

// DeleteProvider removes a provider by ID.
func (s *Store) DeleteProvider(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM providers WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("delete provider: %w", err)
	}
	return nil
}

// GetProvider returns a single provider by ID with decrypted API key.
func (s *Store) GetProvider(ctx context.Context, id string) (*ProviderRow, error) {
	row := s.db.QueryRow(ctx,
		`SELECT id, name, type, endpoint, api_key_enc, models, extra, is_default, created_at, updated_at
		 FROM providers WHERE id=$1`, id)

	var p ProviderRow
	var encKey []byte
	var modelsJSON, extraJSON []byte
	err := row.Scan(&p.ID, &p.Name, &p.Type, &p.Endpoint, &encKey,
		&modelsJSON, &extraJSON, &p.IsDefault, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get provider: %w", err)
	}

	p.APIKey, _ = decrypt(encKey)
	_ = json.Unmarshal(modelsJSON, &p.Models)
	_ = json.Unmarshal(extraJSON, &p.Extra)
	return &p, nil
}

// ListProviders returns all providers with decrypted API keys.
func (s *Store) ListProviders(ctx context.Context) ([]*ProviderRow, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, type, endpoint, api_key_enc, models, extra, is_default, created_at, updated_at
		 FROM providers ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("query providers: %w", err)
	}
	defer rows.Close()

	var providers []*ProviderRow
	for rows.Next() {
		var p ProviderRow
		var encKey []byte
		var modelsJSON, extraJSON []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Endpoint, &encKey,
			&modelsJSON, &extraJSON, &p.IsDefault, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan provider: %w", err)
		}
		p.APIKey, _ = decrypt(encKey)
		_ = json.Unmarshal(modelsJSON, &p.Models)
		_ = json.Unmarshal(extraJSON, &p.Extra)
		providers = append(providers, &p)
	}
	return providers, rows.Err()
}

// SetDefaultProvider sets a provider as default (mutually exclusive).
func (s *Store) SetDefaultProvider(ctx context.Context, id string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Clear all defaults
	if _, err := tx.Exec(ctx, `UPDATE providers SET is_default=false WHERE is_default=true`); err != nil {
		return fmt.Errorf("clear defaults: %w", err)
	}
	// Set new default
	if _, err := tx.Exec(ctx, `UPDATE providers SET is_default=true, updated_at=NOW() WHERE id=$1`, id); err != nil {
		return fmt.Errorf("set default: %w", err)
	}
	return tx.Commit(ctx)
}
