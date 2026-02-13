#!/bin/bash
# Stop the backend WITHOUT removing containers or data

echo "🛑 Stopping backend services..."

cd "$(dirname "$0")/.."

# Stop containers (preserves data and container state)
docker-compose stop

echo ""
echo "✅ Services stopped. Data and containers preserved."
echo "💡 To restart: ./scripts/start.sh"
echo "💡 To fully remove (including containers): docker-compose down"
echo "💡 To remove everything (including volumes): docker-compose down -v"
