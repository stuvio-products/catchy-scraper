#!/bin/bash
# =============================================================================
# deploy.sh — Production Deployment Script for VPS
# =============================================================================
# This script is called by GitHub Actions to deploy the application.
# It clones/pulls the repo, uses .env.prod, and launches with --prod flag.
#
# Expected env vars from GitHub Actions:
#   DEPLOY_BRANCH — git branch to deploy
#   DEPLOY_SHA    — git commit SHA
#   GITHUB_TOKEN  — for private repo access (if needed)

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
APP_DIR="/var/www/catchy-backend"
REPO_URL="https://github.com/stuvio-products/catchy-scraper.git"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
export PROJECT_NAME="catchy-prod"

echo "==========================================="
echo "🚀 Catchy Backend — Production Deployment"
echo "==========================================="
echo "📁 App directory: $APP_DIR"
echo "🌿 Branch: $DEPLOY_BRANCH"
echo "📝 Commit: ${DEPLOY_SHA:-unknown}"
echo ""

# ─── Load NVM (Node Version Manager) ─────────────────────────────────────────
# This is required for non-interactive shells (like GitHub Actions SSH)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "📦 Loading NVM..."
    . "$NVM_DIR/nvm.sh"
    # Use the default node version or the one specified in .nvmrc if it exists
    if [ -f ".nvmrc" ]; then
        nvm use || nvm install
    else
        nvm use default || echo "⚠️  No default node version set in nvm"
    fi
fi

# ─── Ensure Node/NPM are available ─────────────────────────────────────────
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not found in PATH"
    echo "   PATH: $PATH"
    # Try one more common location if nvm loading didn't work
    if [ -f "/usr/local/bin/npm" ]; then
        export PATH="/usr/local/bin:$PATH"
    fi
    if ! command -v npm &> /dev/null; then
        exit 127
    fi
fi
echo "✅ Node $(node -v) and NPM $(npm -v) are available."

# ─── Ensure Docker is Available ─────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose (v2) is not available. Please install docker-compose-plugin."
    exit 1
fi

echo "✅ Docker and Docker Compose are available."

# ─── Clone or Update Repository ─────────────────────────────────────────────
echo ""
echo "📦 Syncing repository..."

if [ -d "$APP_DIR/.git" ]; then
    echo "   Existing repo found. Pulling updates..."
    cd "$APP_DIR"
    
    # Reset any local changes
    git fetch --all --prune
    git checkout "$DEPLOY_BRANCH"
    git reset --hard "origin/$DEPLOY_BRANCH"
    
    echo "✅ Repository updated."
else
    echo "   Cloning fresh copy..."
    mkdir -p "$(dirname "$APP_DIR")"
    
    if [ -n "$GITHUB_TOKEN" ]; then
        CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/stuvio-products/catchy-scraper.git"
    else
        CLONE_URL="$REPO_URL"
    fi
    
    git clone --branch "$DEPLOY_BRANCH" --depth 1 "$CLONE_URL" "$APP_DIR"
    cd "$APP_DIR"
    echo "✅ Repository cloned."
fi

# ─── Verify Environment File ────────────────────────────────────────────────
echo ""
echo "📄 Checking environment file..."

if [ ! -f "$APP_DIR/.env.prod" ]; then
    echo "❌ .env.prod not found!"
    echo ""
    echo "Create it manually on the VPS:"
    echo "  cp $APP_DIR/.env.example $APP_DIR/.env.prod"
    echo "  nano $APP_DIR/.env.prod   # Update with production secrets"
    echo ""
    echo "Or copy from local machine:"
    echo "  scp .env.prod root@your-vps:$APP_DIR/.env.prod"
    exit 1
fi

echo "✅ .env.prod found."

chmod +x "$APP_DIR/scripts/"*.sh 2>/dev/null || true
chmod +x "$APP_DIR/postgres/primary/init.sh" 2>/dev/null || true
chmod +x "$APP_DIR/postgres/replica/init.sh" 2>/dev/null || true

# ─── Nginx Setup ─────────────────────────────────────────────────────────────
echo ""
echo "🔧 Setting up Nginx..."
if [ -f "$APP_DIR/scripts/setup-nginx.sh" ]; then
    bash "$APP_DIR/scripts/setup-nginx.sh"
    echo "✅ Nginx configured."
else
    echo "⚠️  setup-nginx.sh not found, skipping."
fi

# 🏗️  Building and starting production services...
echo ""
echo "🏗️  Building and starting production services..."

# Reusing npm script
npm run start:prod

echo "✅ Services started."

# ─── Wait for Services to be Healthy ─────────────────────────────────────────
echo ""
echo "⏳ Waiting for services to become healthy..."

MAX_WAIT=120
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if DB is healthy
    DB_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' catchy-prod-db 2>/dev/null || echo "unknown")
    REDIS_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' catchy-prod-redis 2>/dev/null || echo "unknown")
    API_RUNNING=$(docker inspect --format='{{.State.Status}}' catchy-prod-api 2>/dev/null || echo "unknown")
    
    echo "   [${WAITED}s] db=$DB_HEALTHY redis=$REDIS_HEALTHY api=$API_RUNNING"
    
    if [ "$DB_HEALTHY" = "healthy" ] && [ "$REDIS_HEALTHY" = "healthy" ] && [ "$API_RUNNING" = "running" ]; then
        echo ""
        echo "✅ All services are healthy!"
        break
    fi
    
    sleep 5
    WAITED=$((WAITED + 5))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo ""
    echo "⚠️  Timeout waiting for services. Check logs:"
    echo "   docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs"
fi

# ─── Run Custom Indexes ─────────────────────────────────────────────────────
echo ""
echo "📊 Applying custom indexes..."

if [ -f "$APP_DIR/scripts/create-product-indexes.sql" ]; then
    # Source prod env vars for DB connection
    set -a
    source "$APP_DIR/.env.prod"
    set +a
    
    docker exec catchy-prod-db psql \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -f /dev/stdin < "$APP_DIR/scripts/create-product-indexes.sql" 2>/dev/null || true
    
    echo "✅ Custom indexes applied."
else
    echo "ℹ️  No custom index script found, skipping."
fi

# ─── Final Status ────────────────────────────────────────────────────────────
# Using npm script to show status
npm run ps:prod

echo ""
echo "🎉 Deployment finished successfully!"
echo ""
echo "Useful commands:"
echo "  Logs:    cd $APP_DIR && npm run logs:prod"
echo "  Status:  cd $APP_DIR && npm run ps:prod"
echo "  Stop:    cd $APP_DIR && npm run stop:prod"
echo "  Restart: cd $APP_DIR && npm run start:prod"
