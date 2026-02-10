#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  🧹 Comprehensive Development Cleanup Script${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
  echo -e "${GREEN}✓ Loaded environment variables from .env${NC}"
else
  echo -e "${RED}✗ .env file not found!${NC}"
  exit 1
fi

# Confirmation prompt
echo -e "${YELLOW}⚠️  WARNING: This will delete ALL data:${NC}"
echo -e "   - Database tables (products, chats, messages)"
echo -e "   - Redis cache and data"
echo -e "   - BullMQ job queues"
echo -e "   - All background jobs"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo -e "${YELLOW}Cleanup cancelled.${NC}"
  exit 0
fi

echo -e "${BLUE}Starting cleanup...${NC}"
echo ""

# ============================================================================
# 1. CLEAR REDIS
# ============================================================================
echo -e "${BLUE}[1/5] Clearing Redis...${NC}"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHALL > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Redis cleared (FLUSHALL)${NC}"
else
  echo -e "${RED}✗ Failed to clear Redis. Is Redis running?${NC}"
fi

echo ""

# ============================================================================
# 2. CLEAR BULLMQ QUEUES
# ============================================================================
echo -e "${BLUE}[2/5] Clearing BullMQ Queues...${NC}"

# Obliterate specific queues (removes all jobs, metrics, etc.)
for queue in "scrape-queue" "product-detail-queue"; do
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "bull:${queue}:*" | xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cleared queue: ${queue}${NC}"
  else
    echo -e "${YELLOW}⚠ Could not clear queue: ${queue}${NC}"
  fi
done

echo ""

# ============================================================================
# 3. CLEAR DATABASE TABLES
# ============================================================================
echo -e "${BLUE}[3/5] Clearing Database Tables...${NC}"

# Use Prisma to run direct SQL for truncation
# This avoids needing psql installed and uses the DATABASE_URL correctly
cat << EOF > .tmp_truncate.sql
SET session_replication_role = 'replica';
TRUNCATE TABLE "products" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "chats" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "messages" RESTART IDENTITY CASCADE;
SET session_replication_role = 'origin';
EOF

npx prisma db execute --file .tmp_truncate.sql > /dev/null 2>&1
TRUNCATE_STATUS=$?
rm .tmp_truncate.sql

if [ $TRUNCATE_STATUS -eq 0 ]; then
  echo -e "${GREEN}✓ Database tables truncated${NC}"
  echo -e "  - products"
  echo -e "  - chats"
  echo -e "  - messages"
else
  echo -e "${RED}✗ Failed to truncate database tables. Check DATABASE_URL.${NC}"
fi

echo ""

# ============================================================================
# 4. RESET PRISMA CLIENT
# ============================================================================
echo -e "${BLUE}[4/5] Resetting Prisma Client...${NC}"

npx prisma generate > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Prisma client regenerated${NC}"
else
  echo -e "${YELLOW}⚠ Could not regenerate Prisma client${NC}"
fi

echo ""

# ============================================================================
# 5. VERIFY CLEANUP
# ============================================================================
echo -e "${BLUE}[5/5] Verifying Cleanup...${NC}"

# Check Redis
REDIS_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE 2>/dev/null | grep -oE '[0-9]+')
if [ "$REDIS_KEYS" = "0" ]; then
  echo -e "${GREEN}✓ Redis is empty (0 keys)${NC}"
else
  echo -e "${YELLOW}⚠ Redis has ${REDIS_KEYS} keys remaining${NC}"
fi

# Check Database via simple query
# Using node to check counts quickly via Prisma might be too heavy here, 
# so we'll just check if the truncate command was successful.
if [ $TRUNCATE_STATUS -eq 0 ]; then
  echo -e "${GREEN}✓ Database is empty (Confirmed by truncate status)${NC}"
else
  echo -e "${YELLOW}⚠ Database might still contain data${NC}"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✓ Cleanup Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Restart services: ${BLUE}npm run start${NC}"
echo -e "  2. Scrape fresh data or test new queries"
echo ""
