//go:build e2e

package comprehensive

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

var baseURL string

func TestMain(m *testing.M) {
	baseURL = os.Getenv("NUKA_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3210"
	}
	// Wait for server readiness (up to 30s)
	for i := 0; i < 30; i++ {
		resp, err := http.Get(baseURL + "/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				os.Exit(m.Run())
			}
		}
		time.Sleep(1 * time.Second)
	}
	fmt.Fprintf(os.Stderr, "server at %s not ready after 30s\n", baseURL)
	os.Exit(1)
}

// --- HTTP helpers ---

func apiGet(t *testing.T, path string) (int, []byte) {
	t.Helper()
	resp, err := http.Get(baseURL + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

func apiPost(t *testing.T, path string, payload interface{}) (int, []byte) {
	t.Helper()
	b, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(baseURL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

func apiDelete(t *testing.T, path string) (int, []byte) {
	t.Helper()
	req, _ := http.NewRequest("DELETE", baseURL+path, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

// sendGatewayMessage sends a message through the REST gateway.
func sendGatewayMessage(t *testing.T, userID, userName, content string) (int, map[string]interface{}) {
	t.Helper()
	status, body := apiPost(t, "/api/gateway/rest/message", map[string]string{
		"user_id":   userID,
		"user_name": userName,
		"content":   content,
	})
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return status, result
}

func decodeMap(t *testing.T, body []byte) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatalf("decode: %v (body: %s)", err, string(body))
	}
	return m
}

func decodeSlice(t *testing.T, body []byte) []interface{} {
	t.Helper()
	var s []interface{}
	if err := json.Unmarshal(body, &s); err != nil {
		t.Fatalf("decode slice: %v (body: %s)", err, string(body))
	}
	return s
}
