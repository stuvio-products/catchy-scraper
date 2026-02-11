#!/bin/bash
# =============================================================================
# Start the Catchy Scraper & Backend Infrastructure (Local Development)
# =============================================================================

# Cleanup function to stop Docker containers on exit
cleanup() {
    echo ""
    echo "🛑 Stopping infrastructure..."
    docker compose stop db redis 2>/dev/null || true
    echo "✅ Infrastructure stopped"
    exit 0
}

echo "🚀 Starting Catchy Scraper Infrastructure..."
echo ""

# ─── Prerequisites check ────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed!"
    echo "   Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "🐳 Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"

# Navigate to project root
cd "$(dirname "$0")/.."

# ─── Load environment ───────────────────────────────────────────────────────
if [ -f .env ]; then
    echo "🔑 Loading environment from .env..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found. Copy .env.example to .env and configure it."
    if [ -f .env.example ]; then
        echo "   Run: cp .env.example .env"
    fi
    exit 1
fi

# ─── Start infrastructure ───────────────────────────────────────────────────
echo "📦 Starting Docker containers (db, redis)..."
docker compose up -d db redis

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Set trap for graceful shutdown
trap cleanup SIGINT SIGTERM

# ─── Database setup ──────────────────────────────────────────────────────────
echo ""
echo "🔄 Running Prisma generate..."
npx prisma generate

echo ""
echo "🔄 Running database migrations..."
if ! npx prisma migrate dev; then
    echo "⚠️  Migrations failed. Trying prisma db push instead..."
    npx prisma db push || {
        echo "❌ Error: Database setup failed!"
        exit 1
    }
fi

# ─── Start application ──────────────────────────────────────────────────────
echo ""
echo "🚀 Starting Applications (API & Worker) in watch mode..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  API:    http://localhost:3000"
echo "  Health: http://localhost:3000/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop everything"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exec npm run dev
