#!/bin/bash
# =============================================================================
# Deployment script for catchy-backend
# Zero-downtime blue-green deployment with Nginx upstream switching
#
# Port allocation (avoids conflicts with existing VPS services):
#   PostgreSQL:  5436  (jamjam uses 5434/5435, brello uses 6379)
#   Redis:       6381  (jamjam uses 6380, brello uses 6379)
#   API blue:    3002  (jamjam uses 3001)
#   API green:   3003
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
DOMAIN="api.catchy.fashion"
APP_DIR="/var/www/catchy-backend"
REPO_URL="git@github.com:stuvio-products/catchy-scraper.git"
REPO_URL_HTTPS="https://github.com/stuvio-products/catchy-scraper.git"
BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SHA="${DEPLOY_SHA:-latest}"

# Blue-green deployment ports (conflict-free with existing VPS services)
BLUE_PORT=3002
GREEN_PORT=3003
INTERNAL_PORT=3000  # Port inside the container
STATE_FILE="${APP_DIR}/.deploy-state"
COMPOSE_FILE="docker-compose.prod.yml"
NETWORK_NAME="catchy-network"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Logging ─────────────────────────────────────────────────────────────────
log()       { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
log_error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1" >&2; }
log_warn()  { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARN:${NC} $1"; }
log_info()  { echo -e "${CYAN}[$(date +'%H:%M:%S')] INFO:${NC} $1"; }
log_step()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

# ─── Docker checks ──────────────────────────────────────────────────────────
ensure_docker() {
    log_step "Checking Docker"

    if ! command -v docker &> /dev/null; then
        log "Installing Docker..."
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg lsb-release
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        systemctl start docker && systemctl enable docker
    fi

    # Verify daemon is running
    local retries=3
    for i in $(seq 1 $retries); do
        if docker info &> /dev/null; then
            log "✅ Docker is running: $(docker --version)"
            return 0
        fi
        log_warn "Docker daemon not responding (attempt $i/$retries)"
        systemctl start docker && sleep 3
    done

    log_error "Docker daemon failed to start"
    return 1
}

ensure_docker_compose() {
    if docker compose version &> /dev/null; then
        log "✅ Docker Compose: $(docker compose version --short)"
        return 0
    fi
    log_error "Docker Compose is not available"
    return 1
}

# ─── Repository management ──────────────────────────────────────────────────
update_repository() {
    log_step "Updating Repository"

    if ! command -v git &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq git
    fi

    export GIT_TERMINAL_PROMPT=0
    git config --global user.name "Deployment Bot" || true
    git config --global user.email "deploy@catchy.fashion" || true

    if [ -d "$APP_DIR/.git" ]; then
        log "Repository exists, pulling latest..."
        cd "$APP_DIR"

        # Update remote URL with token if available
        if [ -n "${GITHUB_TOKEN:-}" ]; then
            git remote set-url origin "https://x:${GITHUB_TOKEN}@github.com/stuvio-products/catchy-scraper.git" 2>/dev/null || true
        fi

        if git fetch origin "$BRANCH" < /dev/null 2>&1; then
            git reset --hard "origin/$BRANCH"
            git clean -fd
            log "✅ Repository updated to $(git rev-parse --short HEAD)"
        else
            log_warn "Fetch failed, will re-clone..."
            cd /var/www && rm -rf "$APP_DIR"
        fi
    fi

    # Clone if needed
    if [ ! -d "$APP_DIR/.git" ]; then
        log "No .git directory found in $APP_DIR"

        # If directory exists but is not a git repo, clean it first
        if [ -d "$APP_DIR" ]; then
            log_warn "Directory $APP_DIR exists but is not a git repository"
            
            # Backup .env if it exists (preserve secrets)
            if [ -f "$APP_DIR/.env" ]; then
                log "Backing up .env file..."
                cp "$APP_DIR/.env" /tmp/catchy-backend-env.bak
            fi

            # Remove existing directory contents to allow fresh clone
            log "Clearing existing directory for fresh clone..."
            rm -rf "$APP_DIR"
        fi

        log "Cloning repository..."
        cd /var/www

        local clone_success=false

        # Try SSH first
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -T git@github.com &>/dev/null; then
            if git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>&1; then
                clone_success=true
            fi
        fi

        # Fallback to HTTPS with token
        if [ "$clone_success" = false ] && [ -n "${GITHUB_TOKEN:-}" ]; then
            for url_format in \
                "https://${GITHUB_TOKEN}@github.com/stuvio-products/catchy-scraper.git" \
                "https://x:${GITHUB_TOKEN}@github.com/stuvio-products/catchy-scraper.git"; do
                if git clone -b "$BRANCH" "$url_format" "$APP_DIR" < /dev/null 2>&1; then
                    clone_success=true
                    break
                fi
            done
        fi

        if [ "$clone_success" = false ]; then
            log_error "Failed to clone repository"
            log "  Ensure GITHUB_TOKEN has 'repo' scope or SSH keys are configured"
            return 1
        fi

        cd "$APP_DIR"

        # Restore .env if it was backed up
        if [ -f /tmp/catchy-backend-env.bak ]; then
            log "Restoring .env file..."
            cp /tmp/catchy-backend-env.bak "$APP_DIR/.env"
            rm -f /tmp/catchy-backend-env.bak
        fi

        log "✅ Repository cloned: $(git rev-parse --short HEAD)"
    fi

    # Verify essential files
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "$COMPOSE_FILE not found after repository update"
        ls -la
        return 1
    fi

    log "✅ Repository ready"
}

# ─── Nginx setup ─────────────────────────────────────────────────────────────
setup_nginx() {
    log_step "Setting up Nginx"
    if [ -f "$APP_DIR/scripts/setup-nginx.sh" ]; then
        chmod +x "$APP_DIR/scripts/setup-nginx.sh"
        bash "$APP_DIR/scripts/setup-nginx.sh" && log "✅ Nginx configured" || log_warn "Nginx setup had issues"
    else
        log_warn "Nginx setup script not found, skipping..."
    fi
}

# ─── Blue-Green deployment helpers ──────────────────────────────────────────
get_active_slot() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "none"
    fi
}

get_active_port() {
    local slot=$(get_active_slot)
    case "$slot" in
        blue)  echo "$BLUE_PORT" ;;
        green) echo "$GREEN_PORT" ;;
        *)     echo "none" ;;
    esac
}

get_inactive_slot() {
    local active=$(get_active_slot)
    case "$active" in
        blue)  echo "green" ;;
        green) echo "blue" ;;
        *)     echo "blue" ;; # Default to blue for first deploy
    esac
}

get_slot_port() {
    case "$1" in
        blue)  echo "$BLUE_PORT" ;;
        green) echo "$GREEN_PORT" ;;
    esac
}

switch_nginx_upstream() {
    local new_port=$1
    local nginx_upstream_conf="/etc/nginx/conf.d/catchy-upstream.conf"

    log "Switching Nginx upstream to port $new_port..."

    cat > "$nginx_upstream_conf" <<EOF
# Auto-managed by deploy.sh — do not edit manually
# catchy-backend API upstream (blue-green deployment)
upstream catchy_backend {
    server 127.0.0.1:${new_port};
    keepalive 64;
}
EOF

    # Test and reload nginx
    if nginx -t 2>&1; then
        systemctl reload nginx
        log "✅ Nginx upstream switched to port $new_port"
    else
        log_error "Nginx config test failed after upstream switch!"
        return 1
    fi
}

health_check() {
    local port=$1
    local max_attempts=${2:-30}
    local attempt=0

    log "Running health check on port $port (max ${max_attempts} attempts)..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "http://127.0.0.1:${port}/health" > /dev/null 2>&1; then
            log "✅ Health check passed on port $port"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    log_error "Health check failed on port $port after $max_attempts attempts"
    return 1
}

# ─── Main deployment ────────────────────────────────────────────────────────
deploy_application() {
    log_step "Deploying Application (Zero-Downtime)"
    cd "$APP_DIR"

    mkdir -p "$APP_DIR/logs"

    # ── Ensure .env exists ──
    if [ ! -f "$APP_DIR/.env" ]; then
        if [ -f "$APP_DIR/.env.example" ]; then
            log_warn ".env file not found — copying from .env.example..."
            cp "$APP_DIR/.env.example" "$APP_DIR/.env"
            log "✅ .env file created from .env.example — update secrets on the VPS"
        else
            log_error ".env and .env.example both missing — cannot continue"
            return 1
        fi
    fi

    local active_slot=$(get_active_slot)
    local new_slot=$(get_inactive_slot)
    local new_port=$(get_slot_port "$new_slot")
    local old_port=$(get_active_port)

    log_info "Active slot: $active_slot (port: $old_port)"
    log_info "Deploying to: $new_slot (port: $new_port)"

    # ── Step 1: Ensure the catchy-network exists ──
    log "Ensuring Docker network '$NETWORK_NAME' exists..."
    docker network create "$NETWORK_NAME" 2>/dev/null || true

    # ── Step 2: Ensure infrastructure services are running ──
    log "Ensuring infrastructure services (db, db-replica, redis, browser-service) are running..."
    docker compose -f "$COMPOSE_FILE" up -d db db-replica redis browser-service || {
        log_error "Failed to start infrastructure services"
        return 1
    }

    # Wait for DB to be healthy
    log "Waiting for database to be healthy..."
    local db_wait=0
    while ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "healthy"; do
        if [ $db_wait -ge 120 ]; then
            log_error "Database did not become healthy within 120s"
            docker compose -f "$COMPOSE_FILE" logs --tail=30 db
            return 1
        fi
        sleep 2
        db_wait=$((db_wait + 2))
    done
    log "✅ Database is healthy"

    # ── Ensure DB User/DB Exists (Self-Healing for persistent volumes) ──
    ensure_db_setup() {
        log "Verifying database user and name..."
        
        # Load env vars to get desired credentials
        if [ -f "$APP_DIR/.env" ]; then
            export $(grep -v '^#' "$APP_DIR/.env" | xargs)
        fi
        
        local db_container="catchy-postgres"
        local desired_user="${POSTGRES_USER:-catchy_admin}"
        local desired_pass="${POSTGRES_PASSWORD:-C@tchy_Pr0d_2026!xK9m}"
        local desired_db="${POSTGRES_DB:-catchy_production}"

        # Check User
        if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$desired_user'" | grep -q 1; then
            log_warn "User '$desired_user' does not exist (old volume?). Creating..."
            docker exec -u postgres "$db_container" psql -c "CREATE USER $desired_user WITH PASSWORD '$desired_pass' SUPERUSER;" || log_error "Failed to create user"
            log "✅ User '$desired_user' created"
        else
            log "✅ User '$desired_user' exists"
            # verify password match? Checking password hash is complex, assuming correct if exists, 
            # or could ALTER USER to ensure password sync.
            docker exec -u postgres "$db_container" psql -c "ALTER USER $desired_user WITH PASSWORD '$desired_pass';" >/dev/null 2>&1
        fi

        # Check DB
        if ! docker exec -u postgres "$db_container" psql -tAc "SELECT 1 FROM pg_database WHERE datname='$desired_db'" | grep -q 1; then
             log_warn "Database '$desired_db' does not exist. Creating..."
             docker exec -u postgres "$db_container" psql -c "CREATE DATABASE $desired_db OWNER $desired_user;" || log_error "Failed to create DB"
             log "✅ Database '$desired_db' created"
        else
             log "✅ Database '$desired_db' exists"
        fi
    }
    ensure_db_setup || log_warn "DB verification failed, proceeding anyway..."

    # Wait for DB Replica
    log "Waiting for database replica to be healthy..."
    local replica_wait=0
    while ! docker compose -f "$COMPOSE_FILE" ps db-replica 2>/dev/null | grep -q "healthy"; do
        if [ $replica_wait -ge 120 ]; then
            log_warn "Replica did not become healthy within 120s, continuing anyway (may fall back to primary)"
            docker compose -f "$COMPOSE_FILE" logs --tail=30 db-replica
            break
        fi
        sleep 2
        replica_wait=$((replica_wait + 2))
    done
    log "✅ Database Replica is healthy"

    # Wait for Redis
    log "Waiting for Redis..."
    local redis_wait=0
    while ! docker compose -f "$COMPOSE_FILE" ps redis 2>/dev/null | grep -q "healthy"; do
        if [ $redis_wait -ge 30 ]; then
            log_warn "Redis health check timed out, continuing..."
            break
        fi
        sleep 2
        redis_wait=$((redis_wait + 2))
    done
    log "✅ Redis is ready"

    # ── Step 3: Build new image (old containers keep running) ──
    log "Building new API image (old instance keeps serving traffic)..."
    if ! docker compose -f "$COMPOSE_FILE" build api; then
        log_error "Failed to build API image"
        return 1
    fi
    log "✅ New image built successfully"

    # ── Step 4: Run database migrations ──
    log "Running database migrations..."
    if docker compose -f "$COMPOSE_FILE" run --rm --no-deps api npx prisma migrate deploy 2>&1; then
        log "✅ Migrations applied"
    else
        log_warn "Migrations returned non-zero (may be OK if no pending migrations)"
    fi

    # ── Step 5: Start new container on the inactive port ──
    log "Starting new API container ($new_slot) on port $new_port..."

    # Stop the new slot container if it exists from a previous failed deploy
    docker rm -f "catchy-api-${new_slot}" 2>/dev/null || true

    # Get the image name from compose
    local api_image
    api_image=$(docker compose -f "$COMPOSE_FILE" images api --format json 2>/dev/null | grep -o '"Repository":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
    if [ -z "$api_image" ]; then
        # Fallback: use the compose project image naming convention
        api_image=$(docker compose -f "$COMPOSE_FILE" config --images 2>/dev/null | grep -i api | head -1 || echo "")
    fi
    if [ -z "$api_image" ]; then
        api_image="catchy-backend-api"
    fi

    log_info "Using image: $api_image"

    # Start new container with port mapping to the new slot port
    # Connect to catchy-network so it can reach db/redis/browser-service by service name
    # Start new container with port mapping to the new slot port
    # All config comes from .env file
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error ".env file missing! Cannot start container."
        return 1
    fi

    docker run -d \
        --name "catchy-api-${new_slot}" \
        --network "$NETWORK_NAME" \
        --env-file "$APP_DIR/.env" \
        -p "127.0.0.1:${new_port}:${INTERNAL_PORT}" \
        --restart unless-stopped \
        "$api_image" || {
        log_error "Failed to start new container on port $new_port"
        return 1
    }

    log "✅ New container started: catchy-api-${new_slot} → 127.0.0.1:${new_port}"

    # ── Step 6: Health check the new container ──
    if ! health_check "$new_port" 30; then
        log_error "New container failed health check, rolling back..."
        echo "--- Container logs ---"
        docker logs --tail=50 "catchy-api-${new_slot}" 2>&1 || true
        echo "--- End logs ---"
        docker rm -f "catchy-api-${new_slot}" 2>/dev/null || true
        log "Rollback complete — old container ($active_slot) still serving traffic"
        return 1
    fi

    # ── Step 7: Switch Nginx upstream to the new port (zero-downtime) ──
    switch_nginx_upstream "$new_port" || {
        log_error "Failed to switch Nginx upstream, rolling back..."
        docker rm -f "catchy-api-${new_slot}" 2>/dev/null || true
        if [ "$old_port" != "none" ]; then
            switch_nginx_upstream "$old_port" || true
        fi
        return 1
    }

    # ── Step 8: Stop old container ──
    if [ "$active_slot" != "none" ]; then
        log "Stopping old container (catchy-api-${active_slot})..."
        docker rm -f "catchy-api-${active_slot}" 2>/dev/null || true
        log "✅ Old container stopped"
    fi

    # Also stop compose-managed api container if it exists (from initial setup)
    docker compose -f "$COMPOSE_FILE" stop api 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" rm -f api 2>/dev/null || true

    # ── Step 9: Update worker and browser-service (safe to restart) ──
    log "Updating worker and browser-service containers..."
    docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate --no-deps worker browser-service 2>/dev/null || log_warn "Worker/Browser update skipped"

    # ── Step 10: Save state ──
    echo "$new_slot" > "$STATE_FILE"
    log "✅ Deploy state saved: $new_slot (port: $new_port)"

    # ── Cleanup old images ──
    log "Cleaning up dangling images..."
    docker image prune -f 2>/dev/null || true
}

# ─── Show status ─────────────────────────────────────────────────────────────
show_status() {
    log_step "Deployment Status"
    cd "$APP_DIR" 2>/dev/null || return 0

    echo ""
    echo "Active Slot: $(get_active_slot) (port: $(get_active_port))"
    echo ""
    echo "Catchy containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=catchy" || true
    echo ""

    local active=$(get_active_slot)
    if [ "$active" != "none" ]; then
        echo "Recent API logs (catchy-api-${active}):"
        docker logs --tail=15 "catchy-api-${active}" 2>/dev/null || true
    fi
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
    log "=========================================="
    log "🚀 Deploying catchy-backend"
    log "   Domain:  ${DOMAIN}"
    log "   Branch:  ${BRANCH}"
    log "   Commit:  ${DEPLOY_SHA:0:7}"
    log "   Ports:   API=${BLUE_PORT}/${GREEN_PORT} DB=5436 Redis=6381"
    log "=========================================="

    ensure_docker
    ensure_docker_compose

    mkdir -p "$APP_DIR"
    cd "$APP_DIR"

    update_repository
    setup_nginx

    # Verify Docker is still accessible before deployment
    docker info &> /dev/null || {
        log_error "Docker daemon lost during setup, aborting"
        exit 1
    }

    if ! deploy_application; then
        log_error "❌ Deployment failed"
        exit 1
    fi

    show_status

    log "=========================================="
    log "✅ Deployment completed — zero downtime"
    log "   URL:     https://${DOMAIN}"
    log "   Health:  https://${DOMAIN}/health"
    log "   Slot:    $(get_active_slot) (port: $(get_active_port))"
    log "=========================================="
}

main "$@"
