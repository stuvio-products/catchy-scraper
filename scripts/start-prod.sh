#!/bin/bash
# =============================================================================
# Start the Full Production Stack (Local or VPS)
# =============================================================================

set -e

# ─── Configuration ───────────────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
NETWORK_NAME="catchy-network"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1" >&2; }

# Navigate to project root
cd "$(dirname "$0")/.."

# ─── 1. Setup Environment ────────────────────────────────────────────────────
if [ -f .env ]; then
    log "🔑 Loading environment from .env..."
else
    warn ".env file not found — creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        log "✅ .env created. Please update secrets for production use."
    else
        error ".env.example missing! Cannot proceed."
        exit 1
    fi
fi

# ─── 2. Setup Network ────────────────────────────────────────────────────────
log "Ensuring Docker network '$NETWORK_NAME' exists..."
docker network create "$NETWORK_NAME" 2>/dev/null || true

# ─── 3. Start Infrastructure (DB + Redis) ────────────────────────────────────
log "Starting Database (Primary) and Redis..."
docker compose -f "$COMPOSE_FILE" up -d db redis

log "Waiting for Primary DB to be healthy..."
timeout=60
while ! docker compose -f "$COMPOSE_FILE" ps db | grep -q "healthy"; do
    if [ $timeout -le 0 ]; then
        error "Primary DB timed out waiting for health check"
        exit 1
    fi
    printf "."
    sleep 2
    timeout=$((timeout - 2))
done
echo ""
log "✅ Primary DB is healthy"

# ─── 4. Start Replica ────────────────────────────────────────────────────────
if grep -q "db-replica:" "$COMPOSE_FILE"; then
    log "Starting Database Replica..."
    docker compose -f "$COMPOSE_FILE" up -d db-replica
    
    # Wait for replica health check if possible, or just proceed in background
    log "Replica started (syncing in background)"
fi

# ─── 5. Run Migrations ───────────────────────────────────────────────────────
log "Running database migrations..."
if docker compose -f "$COMPOSE_FILE" run --rm --no-deps api npx prisma migrate deploy; then
    log "✅ Migrations applied successfully"
else
    warn "Migrations failed or no changes needed"
fi

# ─── 6. Start Application Services ───────────────────────────────────────────
log "Building and Starting API, Worker, and Browser Service..."
# Note: In prod start script we just use 'up' (not blue/green deployment logic).
# This is mainly for testing the prod image locally or simple deployment.
docker compose -f "$COMPOSE_FILE" up -d --build api worker browser-service

# ─── 7. Final Status ─────────────────────────────────────────────────────────
log "✅ All services started!"
echo ""
echo -e "${BLUE}=== Service Status ===${NC}"
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo -e "${BLUE}=== Access Points ===${NC}"
echo "API:             http://localhost:3002"
echo "Health Check:    http://localhost:3002/health"
echo "Postgres:        localhost:5436"
echo "Redis:           localhost:6381"
echo ""
warn "Note: This uses strictly docker-compose.prod.yml configuration."
warn "For zero-downtime updates on VPS, stick to 'scripts/deploy.sh'."
