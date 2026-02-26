#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

echo -e "${CYAN}"
echo "  _   _       _         __        __         _     _ "
echo " | \ | |_   _| | ____ _ \ \      / /__  _ __| | __| |"
echo " |  \| | | | | |/ / _\` | \ \ /\ / / _ \| '__| |/ _\` |"
echo " | |\  | |_| |   < (_| |  \ V  V / (_) | |  | | (_| |"
echo " |_| \_|\__,_|_|\_\__,_|   \_/\_/ \___/|_|  |_|\__,_|"
echo -e "${NC}"
echo "One-click Docker deployment"
echo "==========================================="
echo ""

# Step 1: Check Docker
info "Checking Docker..."
if ! command -v docker &>/dev/null; then
    fail "Docker not found. Install Docker first: https://docs.docker.com/get-docker/"
fi
if ! docker info &>/dev/null; then
    fail "Docker daemon not running. Start Docker Desktop or dockerd."
fi
ok "Docker is ready"

# Step 2: Check docker compose
info "Checking Docker Compose..."
if docker compose version &>/dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
else
    fail "Docker Compose not found."
fi
ok "Using: $COMPOSE"

# Step 3: Create .env if missing
if [ ! -f .env ]; then
    warn ".env not found, creating from template..."
    cp .env.example .env
    echo ""
    warn "Please edit .env and fill in your API keys, then re-run this script."
    warn "At minimum, set one LLM provider key (XFYUN_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)"
    exit 1
fi
ok ".env exists"

# Step 4: Validate LLM provider
info "Checking LLM provider configuration..."
source .env 2>/dev/null || true
HAS_LLM=false
[ -n "${XFYUN_API_KEY:-}" ] && HAS_LLM=true
[ -n "${OPENAI_API_KEY:-}" ] && HAS_LLM=true
[ -n "${ANTHROPIC_API_KEY:-}" ] && HAS_LLM=true
if [ "$HAS_LLM" = false ]; then
    fail "No LLM provider configured. Edit .env and set at least one API key."
fi
ok "LLM provider configured"

# Step 5: Deploy
echo ""
info "Starting Nuka World (building + pulling images)..."
echo ""
$COMPOSE up -d --build

echo ""
info "Waiting for services to be healthy..."
sleep 5

# Step 6: Health check
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:${PORT:-3210}/api/gateway/status >/dev/null 2>&1; then
        break
    fi
    RETRY=$((RETRY + 1))
    sleep 2
done

echo ""
if [ $RETRY -lt $MAX_RETRIES ]; then
    ok "Nuka World is running!"
    echo ""
    echo "==========================================="
    echo -e "  Server:    ${GREEN}http://localhost:${PORT:-3210}${NC}"
    echo -e "  Status:    ${GREEN}http://localhost:${PORT:-3210}/api/gateway/status${NC}"
    echo -e "  Neo4j UI:  ${GREEN}http://localhost:7474${NC}"
    echo ""
    echo "  CLI Chat:"
    echo "    go run cmd/chat/main.go"
    echo ""
    echo "  View logs:"
    echo "    $COMPOSE logs -f nuka"
    echo ""
    echo "  Stop:"
    echo "    $COMPOSE down"
    echo "==========================================="
else
    warn "Nuka World may still be starting up."
    echo "  Check logs: $COMPOSE logs -f nuka"
fi
