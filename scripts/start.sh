#!/bin/bash
# Start the Scraper & Backend Infrastructure

# Cleanup function to stop Docker containers
cleanup() {
    echo ""
    echo "🛑 Stopping infrastructure..."

    # Stop Docker containers
    if command -v docker-compose &> /dev/null; then
        docker-compose stop db db-replica redis browser-service
    else
        docker compose stop db db-replica redis browser-service
    fi

    echo "✅ Infrastructure stopped"
    exit 0
}

echo "🚀 Starting Scraper Infrastructure..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed!"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "🐳 Docker is not running. Please start Docker manually."
    exit 1
fi

echo "✅ Docker is running"

# Navigate to root directory
cd "$(dirname "$0")/.."

# Source environment variables for the shell (e.g. for Prisma CLI)
if [ -f .env ]; then
    echo "🔑 Loading environment from .env..."
    # Export variables from .env, ignoring comments
    export $(grep -v '^#' .env | xargs)
fi

# Start infrastructure services (DB, Redis, Browser Service)
echo "📦 Starting Docker containers (db, redis, browser-service)..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d db db-replica redis browser-service
else
    docker compose up -d db db-replica redis browser-service
fi

echo ""
echo "⏳ Waiting for databases to be ready..."
sleep 5

# Set trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

echo ""
echo "🔄 Running database migrations..."
if ! npx prisma migrate dev; then
    echo "❌ Error: Database migrations failed!"
    exit 1
fi

echo ""
echo "🚀 Starting Applications (API & Worker) in watch mode..."
echo "-----------------------------------------------------"
echo "👉 Press Ctrl+C to stop the apps and Docker containers"
echo "-----------------------------------------------------"

# Start API and Worker concurrently
exec npm run dev
