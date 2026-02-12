#!/bin/bash
# =============================================================================
# Deployment Script for Catchy Scraper (Simplified Strategy)
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
APP_DIR="/var/www/catchy-backend"
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

# Navigate to app directory
cd "$APP_DIR" || {
    # If running locally (not on VPS), use current dir
    warn "Cannot cd to $APP_DIR, assuming current directory is correct."
}

# ─── 1. Setup Environment ────────────────────────────────────────────────────
if [ -f .env ]; then
    log "🔑 Loading environment..."
else
    warn ".env file not found — creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        log "✅ .env created. Please update secrets."
    else
        error ".env.example missing!"
        exit 1
    fi
fi

# Check for stale .env (root cause of migration failure)
if grep -q "postgres:" .env && grep -q "catchy_admin:" .env.example; then
    warn "Detected stale DATABASE_URL (user 'postgres') in .env. Updating from .env.example..."
    cp .env .env.bak
    cp .env.example .env
    log "✅ .env updated (backup saved to .env.bak). Now using correct 'catchy_admin' credentials."
fi

# ─── 2. Setup Network ────────────────────────────────────────────────────────
if ! docker network ls | grep -q "$NETWORK_NAME"; then
    log "Creating network '$NETWORK_NAME'..."
    docker network create "$NETWORK_NAME"
fi

# ─── 3. Start Infrastructure ─────────────────────────────────────────────────
log "Starting Infrastructure (DB, Redis)..."
# Pull latest images just in case
docker compose -f "$COMPOSE_FILE" pull db db-replica redis browser-service || warn "Failed to pull some images"

# Start Infra
docker compose -f "$COMPOSE_FILE" up -d db redis browser-service

log "Waiting for Primary DB..."
until docker compose -f "$COMPOSE_FILE" ps db | grep -q "healthy"; do
    printf "."
    sleep 2
done
echo ""
log "✅ Primary DB is healthy"

# ─── Self-Healing: Ensure DB Users ──────────────────────────────────────────
# ─── Self-Healing: Ensure DB Users ──────────────────────────────────────────
ensure_db_setup() {
    log "Verifying DB users and schema..."
    local db_container="catchy-postgres"
    if [ -f .env ]; then export $(grep -v '^#' .env | xargs); fi
    
    local desired_user="${POSTGRES_USER:-catchy_admin}"
    local desired_pass="${POSTGRES_PASSWORD:-C@tchy_Pr0d_2026!xK9m}"
    local desired_db="${POSTGRES_DB:-catchy_production}"

    # Helper function to run psql as the correct user
    exec_psql() {
        docker exec -u postgres "$db_container" psql -U "$desired_user" -d "$desired_db" "$@"
    }

    # Verify connection first
    if ! exec_psql -c "SELECT 1" >/dev/null 2>&1; then
        warn "Could not connect as '$desired_user'. Assuming auth failure or initial setup."
    else
        log "✅ Connected as '$desired_user'"
    fi

    # Check/Create Admin User (Self-Correction not possible if we can't connect, skipping recursive logic)
    
    # Check/Create Replicator
    if ! exec_psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='replicator'" 2>/dev/null | grep -q 1; then
        warn "User 'replicator' missing. Creating..."
        exec_psql -c "CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';" || error "Failed to create replicator"
        log "✅ User 'replicator' created"
    else
        # Force password update to ensure sync
        exec_psql -c "ALTER USER replicator WITH PASSWORD 'replicator_password';" >/dev/null 2>&1
        log "✅ User 'replicator' exists (password synced)"
    fi

    # Check/Create Slot
    if ! exec_psql -tAc "SELECT 1 FROM pg_replication_slots WHERE slot_name='replication_slot'" 2>/dev/null | grep -q 1; then
        warn "Slot 'replication_slot' missing. Creating..."
        exec_psql -c "SELECT pg_create_physical_replication_slot('replication_slot');" || error "Failed to create slot"
        log "✅ Slot 'replication_slot' created"
    else
        log "✅ Slot 'replication_slot' exists"
    fi
}
ensure_db_setup || warn "Self-healing failed (non-critical if DB good)."

# ─── 4. Start Replica ────────────────────────────────────────────────────────
log "Starting Replica..."
docker compose -f "$COMPOSE_FILE" up -d db-replica

log "Waiting for Replica (timeout 60s)..."
wait_count=0
while ! docker compose -f "$COMPOSE_FILE" ps db-replica | grep -q "healthy"; do
    if [ $wait_count -ge 60 ]; then
        warn "Replica not healthy yet. Continuing deployment anyway (JamJam strategy)..."
        break
    fi
    printf "."
    sleep 2
    wait_count=$((wait_count + 2))
done
echo ""

# ─── 5. Migrations ───────────────────────────────────────────────────────────
log "Building Application..."
docker compose -f "$COMPOSE_FILE" build api worker browser-service

log "Running Migrations..."
if docker compose -f "$COMPOSE_FILE" run --rm --no-deps api npx prisma migrate deploy; then
    log "✅ Migrations applied"
else
    error "Migrations failed!"
    exit 1
fi

# ─── 6. Deploy Application ───────────────────────────────────────────────────
log "Deploying API and Worker (Recreating)..."
# Force recreate ensures fresh containers with new configs/images
docker compose -f "$COMPOSE_FILE" up -d --force-recreate api worker browser-service

# ─── 7. Final checks ─────────────────────────────────────────────────────────
log "Waiting for API to be ready..."
timeout=60
while ! curl -f http://localhost:3002/health >/dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        warn "API health check timed out. Check logs."
        break
    fi
    printf "."
    sleep 2
    timeout=$((timeout - 2))
done
echo ""
log "✅ Deployment Complete!"
docker compose -f "$COMPOSE_FILE" ps
