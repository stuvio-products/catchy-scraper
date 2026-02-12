#!/bin/bash
# =============================================================================
# db-sync.sh — Database Synchronization Tool
# =============================================================================
# Usage:
#   ./scripts/db-sync.sh --push   (Local -> Prod)
#   ./scripts/db-sync.sh --pull   (Prod -> Local)
#   ./scripts/db-sync.sh --sync   (Bidirectional)
#
# Prerequisites:
#   - Docker must be running.
#   - .env.local must exist and contain local DB configs.
#   - .env.prod must exist and contain PROD_DATABASE_URL or DATABASE_URL safe for external access.
#     (Or you can export PROD_DATABASE_URL before running the script)

set -o pipefail

# Cleanup trap
cleanup() {
    rm -f .tmp_sync_dump.sql
}
trap cleanup EXIT INT TERM

# ─── Configuration ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ─── Helper Functions ───────────────────────────────────────────────────────
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check dependencies
check_deps() {
    if ! docker info &>/dev/null; then
        log_error "Docker is not running. Please start Docker."
        exit 1
    fi
}

# Load Environment Variables
load_envs() {
    # Load Local Env
    if [ -f ".env.local" ]; then
        set -a
        source .env.local
        set +a
        LOCAL_DB_PORT=${DB_PORT:-5432}
        LOCAL_DB_USER=${POSTGRES_USER}
        LOCAL_DB_NAME=${POSTGRES_DB}
        LOCAL_DB_PASS=${POSTGRES_PASSWORD}
        # Docker container name for local dev DB
        LOCAL_CONTAINER="catchy-dev-db"
    else
        log_error ".env.local file not found!"
        exit 1
    fi

    # Load Prod Env or Variable
    # Prioritize explicitly set PROD_DATABASE_URL
    if [ -z "$PROD_DATABASE_URL" ]; then
        if [ -f ".env.prod" ]; then
            # We grep it to avoid sourcing the whole file which might overwrite LOCAL vars
            PROD_URL_FROM_FILE=$(grep "^DATABASE_URL=" .env.prod | cut -d'=' -f2- | tr -d '"' | tr -d "'")
            REPLICA_URL_FROM_FILE=$(grep "^DATABASE_REPLICA_URL=" .env.prod | cut -d'=' -f2- | tr -d '"' | tr -d "'")
            
            if [ -n "$PROD_URL_FROM_FILE" ]; then
                PROD_DATABASE_URL=$PROD_URL_FROM_FILE
            fi
        fi
    fi

    if [ -z "$PROD_DATABASE_URL" ]; then
        log_error "PROD_DATABASE_URL is not set and could not be found in .env.prod"
        log_info "Please set PROD_DATABASE_URL environment variable or define DATABASE_URL in .env.prod"
        log_info "Format: postgres://user:pass@host:port/dbname"
        exit 1
    fi

    # Check if PROD_DATABASE_URL uses 'db' host (internal docker)
    if [[ "$PROD_DATABASE_URL" == *"@db:"* ]]; then
        log_warn "Detected internal docker hostname 'db' in PROD_DATABASE_URL."
        echo "   This URL is valid inside Docker but invalid for external sync."
        echo "   - If syncing with a VPS, provide the Public IP."
        echo "   - If syncing with Local Prod Simulation, use 'host.docker.internal' (Mac/Win) or '172.17.0.1' (Linux)."
        echo "   - Press Enter to keep 'db' (only works if networks are bridged manually)."
        
        read -p "Enter External Host/IP [default: keep 'db']: " PROD_HOST_OVERRIDE
        
        if [ -n "$PROD_HOST_OVERRIDE" ]; then
            # We need to rebuild the URL because port might also change (Internal 5432 vs External Port)
            # Source .env.prod to get correct credentials and ports
            if [ -f ".env.prod" ]; then
                set -a
                source .env.prod
                set +a
            fi
            
            # Use DB_PORT from .env.prod (e.g., 5436) or default to 5432
            EXTERNAL_PORT=${DB_PORT:-5432}
            
            # Encode password to handle special chars like @ which break URL parsing
            # We use node for this since it's guaranteed to be available in this environment
            ENCODED_PASS=$(PASS="$POSTGRES_PASSWORD" node -e 'console.log(encodeURIComponent(process.env.PASS))')
            
            # Reconstruct URL with encoded password
            # We explicitly do NOT include ?schema=public here as pg_dump/psql fail on it
            PROD_DATABASE_URL="postgresql://${POSTGRES_USER}:${ENCODED_PASS}@${PROD_HOST_OVERRIDE}:${EXTERNAL_PORT}/${POSTGRES_DB}"
            
            # Log masked URL for safety
            log_info "Using Overridden Prod URL: postgres://*****:*****@${PROD_HOST_OVERRIDE}:${EXTERNAL_PORT}/${POSTGRES_DB}..."
        fi
    fi

    # Final cleanup: Strip any query parameters (like ?schema=public) from the URL
    # This ensures pg_dump/psql don't fail with "invalid URI query parameter"
    PROD_DATABASE_URL=${PROD_DATABASE_URL%\?*}
}

# Sync Function
# $1 = Source Connection (or "LOCAL")
# $2 = Target Connection (or "LOCAL")
# $3 = Description
perform_sync() {
    local SOURCE=$1
    local TARGET=$2
    local DESC=$3

    log_info "Starting sync: $DESC"
    
    # We use the LOCAL_CONTAINER to run pg_dump and psql to ensure version compatibility and tool availability.
    # Note: We use --on-conflict-do-nothing to ensure we don't overwrite existing data (sync missing only).
    
    local TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local DUMP_FILE="/tmp/dump_${TIMESTAMP}.sql"
    
    # 1. GENERATE DUMP
    log_info "  ↳ Dumping data from source..."
    
    if [ "$SOURCE" == "LOCAL" ]; then
        # Dump from Local Container
        docker exec "$LOCAL_CONTAINER" pg_dump \
            -U "$LOCAL_DB_USER" \
            -d "$LOCAL_DB_NAME" \
            --data-only \
            --column-inserts \
            --on-conflict-do-nothing \
            --no-owner \
            --schema=public \
            --exclude-table=prisma_migrations \
            --exclude-table=_prisma_migrations \
            > ".tmp_sync_dump.sql"
            
    else
        # Dump from Remote URL using Local Container's pg_dump
        docker exec "$LOCAL_CONTAINER" pg_dump "$SOURCE" \
            --data-only \
            --column-inserts \
            --on-conflict-do-nothing \
            --no-owner \
            --schema=public \
            --exclude-table=prisma_migrations \
            --exclude-table=_prisma_migrations \
            > ".tmp_sync_dump.sql"
    fi

    if [ ! -s ".tmp_sync_dump.sql" ]; then
        log_error "Dump failed or was empty."
        rm ".tmp_sync_dump.sql"
        return 1
    fi

    # 2. APPLY DUMP
    log_info "  ↳ Applying data to target..."
    
    if [ "$TARGET" == "LOCAL" ]; then
        # Ensure Schema Exists locally
        log_info "  ↳ Ensuring local schema exists (running prisma db push)..."
        # We run this on HOST against the mapped port (which is what prisma config uses if using localhost)
        # OR we need to run it inside container? npx is on host.
        # Assuming npx prisma works on host and connects to localhost:5432 (mapped)
        # But wait, .env.local says host:db. npx on host fails unless we use localhost.
        # This is the same problem as studio.
        
        # Workaround: Use the same trick as prisma-studio.sh logic or just assume user has a valid .env for host?
        # User's .env.local has host=db.
        # We should probably run this command with an overridden DATABASE_URL for host access.
        
        # Construct Host-friendly URL
        HOST_DB_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASS}@localhost:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}?schema=public"
        
        DATABASE_URL="$HOST_DB_URL" npx prisma db push --skip-generate || {
            log_error "Failed to push schema to local DB."
            return 1
        }
        
        # Apply to Local
        cat ".tmp_sync_dump.sql" | docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" > /dev/null
    else
        # Apply to Remote
        cat ".tmp_sync_dump.sql" | docker exec -i "$LOCAL_CONTAINER" psql "$TARGET" > /dev/null
    fi

    # Cleanup
    rm ".tmp_sync_dump.sql"
    log_success "Sync completed: $DESC"
}

# ─── Main Execution ─────────────────────────────────────────────────────────

check_deps
load_envs

MODE=""

case "$1" in
    --push)
        MODE="push"
        ;;
    --pull)
        MODE="pull"
        ;;
    --sync)
        MODE="sync"
        ;;
    *)
        echo "Usage: $0 {--push|--pull|--sync}"
        exit 1
        ;;
esac

echo "======================================================="
echo "  DB Sync Tool"
echo "  Mode: $MODE"
echo "  Local User: $LOCAL_DB_USER"
echo "  Prod URL:   ${PROD_DATABASE_URL:0:25}..."
echo "======================================================="

read -p "Are you sure you want to proceed? This will modify the target database(s). (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

if [ "$MODE" == "push" ] || [ "$MODE" == "sync" ]; then
    # Local -> Prod
    perform_sync "LOCAL" "$PROD_DATABASE_URL" "Local -> Production"
fi

if [ "$MODE" == "pull" ] || [ "$MODE" == "sync" ]; then
    # Prod -> Local
    perform_sync "$PROD_DATABASE_URL" "LOCAL" "Production -> Local"
fi

log_success "All operations completed successfully."
