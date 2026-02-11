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

# ── Ensure DB User/DB Exists (Self-Healing) ──
ensure_db_setup() {
    log "Verifying database user and name..."
    
    # Load env vars to get desired credentials
    if [ -f ".env" ]; then
        export $(grep -v '^#' ".env" | xargs)
    fi
    
    local db_container="catchy-postgres"
    local desired_user="${POSTGRES_USER:-catchy_admin}"
    local desired_pass="${POSTGRES_PASSWORD:-C@tchy_Pr0d_2026!xK9m}"
    local desired_db="${POSTGRES_DB:-catchy_production}"

    # Check User
    if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$desired_user'" | grep -q 1; then
        warn "User '$desired_user' does not exist. Creating..."
        docker exec -u postgres "$db_container" psql -c "CREATE USER $desired_user WITH PASSWORD '$desired_pass' SUPERUSER;" || error "Failed to create user"
        log "✅ User '$desired_user' created"
    else
        log "✅ User '$desired_user' exists"
        docker exec -u postgres "$db_container" psql -c "ALTER USER $desired_user WITH PASSWORD '$desired_pass';" >/dev/null 2>&1
    fi

    # Check DB
    if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_database WHERE datname='$desired_db'" | grep -q 1; then
         warn "Database '$desired_db' does not exist. Creating..."
         docker exec -u postgres "$db_container" psql -c "CREATE DATABASE $desired_db OWNER $desired_user;" || error "Failed to create DB"
         log "✅ Database '$desired_db' created"
    else
         log "✅ Database '$desired_db' exists"
    fi

    # KEY FIX: Check Replicator User
    if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='replicator'" | grep -q 1; then
        warn "User 'replicator' does not exist. Creating..."
        docker exec -u postgres "$db_container" psql -c "CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';" || error "Failed to create replicator"
        log "✅ User 'replicator' created"
    else
        log "✅ User 'replicator' exists"
    fi
    
    # Check Replication Slot
    if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_replication_slots WHERE slot_name='replication_slot'" | grep -q 1; then
        warn "Replication slot 'replication_slot' does not exist. Creating..."
        docker exec -u postgres "$db_container" psql -c "SELECT pg_create_physical_replication_slot('replication_slot');" || error "Failed to create slot"
        log "✅ Replication slot created"
    else
        log "✅ Replication slot exists"
    fi
}
ensure_db_setup || warn "DB verification failed, proceeding anyway..."

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
