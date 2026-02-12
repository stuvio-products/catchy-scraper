#!/bin/bash
# =============================================================================
# db-backup.sh — Database Backup & Restore Tool
# =============================================================================
# Usage:
#   ./scripts/db-backup.sh backup              (Backup Local DB)
#   ./scripts/db-backup.sh backup --prod       (Backup Production DB)
#   ./scripts/db-backup.sh restore <file>      (Restore to Local DB)
#   ./scripts/db-backup.sh restore <file> --prod (Restore to Production DB)

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Helper Functions ───────────────────────────────────────────────────────
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

check_deps() {
    if ! docker info &>/dev/null; then
        log_error "Docker is not running. Please start Docker."
        exit 1
    fi
}

load_envs() {
    if [ -f ".env.local" ]; then
        set -a
        source .env.local
        set +a
        LOCAL_DB_PORT=${DB_PORT:-5432}
        LOCAL_DB_USER=${POSTGRES_USER}
        LOCAL_DB_NAME=${POSTGRES_DB}
        LOCAL_CONTAINER="catchy-dev-db"
    else
        log_error ".env.local file not found!"
        exit 1
    fi

    # Determine Prod URL if needed
    if [[ "$*" == *"--prod"* ]]; then
        if [ -z "$PROD_DATABASE_URL" ] && [ -f ".env.prod" ]; then
             PROD_DATABASE_URL=$(grep "^DATABASE_URL=" .env.prod | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        fi
        
        if [ -z "$PROD_DATABASE_URL" ]; then
             log_error "PROD_DATABASE_URL not found in .env.prod or environment."
             exit 1
        fi

        # Check for internal 'db' hostname and offer override
        if [[ "$PROD_DATABASE_URL" == *"@db:"* ]]; then
            log_warn "Detected internal docker hostname 'db' in PROD_DATABASE_URL."
            log_warn "This is usually invalid for external backups (e.g. from local to VPS)."
            
            read -p "Enter External Host/IP for Prod (leave empty to keep 'db'): " PROD_HOST_OVERRIDE
            
            if [ -n "$PROD_HOST_OVERRIDE" ]; then
                if [ -f ".env.prod" ]; then
                    set -a
                    source .env.prod
                    set +a
                fi
                EXTERNAL_PORT=${DB_PORT:-5432}
                
                # Encode password to handle special chars
                ENCODED_PASS=$(PASS="$POSTGRES_PASSWORD" node -e 'console.log(encodeURIComponent(process.env.PASS))')

                # We explicitly do NOT include ?schema=public here as pg_dump/psql fail on it
                PROD_DATABASE_URL="postgresql://${POSTGRES_USER}:${ENCODED_PASS}@${PROD_HOST_OVERRIDE}:${EXTERNAL_PORT}/${POSTGRES_DB}"
                log_info "Using Overridden Prod URL: postgres://*****:*****@${PROD_HOST_OVERRIDE}:${EXTERNAL_PORT}/${POSTGRES_DB}..."
            fi
        fi
        
        # Final cleanup: Strip any query parameters (like ?schema=public) from the URL
        PROD_DATABASE_URL=${PROD_DATABASE_URL%\?*}
    fi
}

# ─── core Logic ─────────────────────────────────────────────────────────────

run_backup() {
    local TARGET_ENV="LOCAL"
    if [[ "$1" == "--prod" ]]; then TARGET_ENV="PROD"; fi

    mkdir -p "$BACKUP_DIR"
    local TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
    local FILENAME="backup_${TARGET_ENV,,}_${TIMESTAMP}.sql"
    local FILEPATH="$BACKUP_DIR/$FILENAME"

    log_info "Starting BACKUP ($TARGET_ENV)..."

    if [ "$TARGET_ENV" == "LOCAL" ]; then
        # Dump Local
        docker exec "$LOCAL_CONTAINER" pg_dump \
            -U "$LOCAL_DB_USER" \
            -d "$LOCAL_DB_NAME" \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --exclude-table=prisma_migrations \
            --exclude-table=_prisma_migrations \
            > "$FILEPATH"
    else
        # Dump Prod (using local container client)
        docker exec "$LOCAL_CONTAINER" pg_dump "$PROD_DATABASE_URL" \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --exclude-table=prisma_migrations \
            --exclude-table=_prisma_migrations \
            > "$FILEPATH"
    fi

    if [ -s "$FILEPATH" ]; then
        log_success "Backup saved to: backups/$FILENAME"
    else
        log_error "Backup failed or file is empty."
        rm -f "$FILEPATH"
        exit 1
    fi
}

run_restore() {
    local FILEPATH="$1"
    local TARGET_ENV="LOCAL"
    if [[ "$2" == "--prod" ]]; then TARGET_ENV="PROD"; fi

    if [ -z "$FILEPATH" ]; then
        log_error "Please specify a backup file to restore."
        log_info "Usage: ./scripts/db-backup.sh restore <path/to/backup.sql> [--prod]"
        exit 1
    fi

    if [ ! -f "$FILEPATH" ]; then
        log_error "File not found: $FILEPATH"
        exit 1
    fi

    log_warn "You are about to RESTORE ($TARGET_ENV) from $FILEPATH"
    log_warn "This will OVERWRITE existing data!"
    read -p "Are you sure? (y/N) " confirm
    if [[ "$confirm" != "y" ]]; then
        echo "Aborted."
        exit 1
    fi

    log_info "Restoring..."

    if [ "$TARGET_ENV" == "LOCAL" ]; then
        cat "$FILEPATH" | docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" > /dev/null
    else
        cat "$FILEPATH" | docker exec -i "$LOCAL_CONTAINER" psql "$PROD_DATABASE_URL" > /dev/null
    fi

    log_success "Restore completed."
}

# ─── Main ───────────────────────────────────────────────────────────────────

check_deps
load_envs "$@"

COMMAND="$1"
shift

case "$COMMAND" in
    backup)
        run_backup "$@"
        ;;
    restore)
        run_restore "$@"
        ;;
    *)
        echo "Usage: $0 {backup|restore} [options]"
        exit 1
        ;;
esac
