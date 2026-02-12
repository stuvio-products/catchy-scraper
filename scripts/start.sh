#!/bin/bash
# =============================================================================
# start.sh — Unified Docker Compose Launcher
# =============================================================================
# Usage:
#   ./scripts/start.sh              → starts in DEVELOPMENT mode
#   ./scripts/start.sh --dev        → starts in DEVELOPMENT mode (explicit)
#   ./scripts/start.sh --prod       → starts in PRODUCTION mode
#   ./scripts/start.sh --prod -d    → starts in PRODUCTION mode (detached)
#   ./scripts/start.sh --down       → stops all services
#   ./scripts/start.sh --prod --down → stops production services
#
# Environment files:
#   Dev:  .env.local
#   Prod: .env.prod

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ─── Ensure Docker is Running ──────────────────────────────────────────────
if ! docker info &>/dev/null; then
    echo "🐳 Docker is not running. Starting Docker..."

    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS — open Docker Desktop
        open -a Docker
    else
        # Linux — try systemctl
        sudo systemctl start docker 2>/dev/null || {
            echo "❌ Could not start Docker. Please start it manually."
            exit 1
        }
    fi

    # Wait for Docker daemon to be ready (max 30s)
    MAX_WAIT=30
    WAITED=0
    while ! docker info &>/dev/null; do
        if [ $WAITED -ge $MAX_WAIT ]; then
            echo "❌ Docker failed to start within ${MAX_WAIT}s. Please start it manually."
            exit 1
        fi
        printf "\r   Waiting for Docker daemon... (%ds)" "$WAITED"
        sleep 2
        WAITED=$((WAITED + 2))
    done
    printf "\r"
    echo "✅ Docker is running.                    "
fi

MODE="dev"
ACTION="up"
EXTRA_ARGS=""
DETACHED=""

# ─── Parse Arguments ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prod)
            MODE="prod"
            shift
            ;;
        --dev)
            MODE="dev"
            shift
            ;;
        --down)
            ACTION="down"
            shift
            ;;
        --build)
            EXTRA_ARGS="$EXTRA_ARGS --build"
            shift
            ;;
        -d|--detach)
            DETACHED="-d"
            shift
            ;;
        --logs)
            ACTION="logs"
            shift
            ;;
        --ps)
            ACTION="ps"
            shift
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

# ─── Set Environment File ───────────────────────────────────────────────────
if [ "$MODE" = "prod" ]; then
    ENV_FILE=".env.prod"
    COMPOSE_OVERRIDE="docker-compose.prod.yml"
    echo "🚀 Mode: PRODUCTION"
else
    ENV_FILE=".env.local"
    COMPOSE_OVERRIDE="docker-compose.dev.yml"
    echo "🛠️  Mode: DEVELOPMENT"
fi

# ─── Validate Env File ──────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo ""
    echo "Please create it first:"
    if [ "$MODE" = "prod" ]; then
        echo "  cp .env.example .env.prod   # then edit with production values"
    else
        echo "  cp .env.example .env.local  # then edit with dev values"
    fi
    exit 1
fi

echo "📄 Using env file: $ENV_FILE"
echo "📦 Using compose:  docker-compose.yml + $COMPOSE_OVERRIDE"
echo ""

# ─── Docker Compose Command ─────────────────────────────────────────────────
# Use separate project names so dev and prod get isolated containers, volumes & networks
if [ "$MODE" = "prod" ]; then
    PROJECT_NAME="catchy-prod"
else
    PROJECT_NAME="catchy-dev"
fi
export PROJECT_NAME

COMPOSE_CMD="docker compose -p $PROJECT_NAME --env-file $ENV_FILE -f docker-compose.yml -f $COMPOSE_OVERRIDE"

# ─── Execute Action ──────────────────────────────────────────────────────────
case "$ACTION" in
    up)
        echo "▶️  Starting services..."
        
        # Make init scripts executable
        chmod +x postgres/primary/init.sh 2>/dev/null || true
        chmod +x postgres/replica/init.sh 2>/dev/null || true
        
        if [ "$MODE" = "dev" ]; then
            $COMPOSE_CMD up --build $DETACHED $EXTRA_ARGS
        else
            $COMPOSE_CMD up --build $DETACHED $EXTRA_ARGS
        fi
        ;;
    down)
        echo "⏹️  Stopping services..."
        $COMPOSE_CMD down $EXTRA_ARGS
        ;;
    logs)
        echo "📋 Showing logs..."
        $COMPOSE_CMD logs -f $EXTRA_ARGS
        ;;
    ps)
        echo "📊 Service status:"
        $COMPOSE_CMD ps $EXTRA_ARGS
        ;;
esac
