# Getting Started: Scraper & Backend API

This guide provides step-by-step instructions to get the combined Scraper and Backend API infrastructure running locally.

## 📋 Prerequisites

- **Docker & Docker Compose** (v2+)
- **Node.js 20+**
- **npm** (comes with Node.js)

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/stuvio-products/catchy-scraper.git
cd catchy-scraper

# 2. Set up environment
cp .env.example .env.local

# 3. Start all services (dev mode)
./scripts/start.sh
```

That's it! All services (DB, Redis, API, Worker, Browser Service) will start automatically.

---

## 📁 Environment Files

| File           | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `.env.example` | Template — copy to create `.env.local` or `.env.prod` |
| `.env.local`   | **Development** — used by `./scripts/start.sh`        |
| `.env.prod`    | **Production** — used by `./scripts/start.sh --prod`  |

### Key Configuration

Edit `.env.local` and provide values for:

- `GEMINI_API_KEY`: Required for Chat features and embeddings.
- `JWT_SECRET`: Any secure string for token signing.
- `EMAIL_PASS`: App password if you want to test password reset.

---

## 🐳 Docker Services

| Service                  | Container                | Internal Port | Dev Host Port | Prod Host Port |
| ------------------------ | ------------------------ | ------------- | ------------- | -------------- |
| PostgreSQL (Primary)     | `catchy-db`              | 5432          | 5432          | 5440           |
| PostgreSQL (Replica)     | `catchy-db-replica`      | 5432          | 5433          | 5441           |
| Redis                    | `catchy-redis`           | 6379          | 6379          | 6380           |
| API (NestJS)             | `catchy-api`             | 3000          | 3000          | 4000           |
| Worker (NestJS)          | `catchy-worker`          | —             | —             | —              |
| Browser Service (NestJS) | `catchy-browser-service` | 3001          | 3001          | 4001           |

> All ports are configurable via the `.env.local` / `.env.prod` files.

---

## 🛠️ Scripts Reference

### Start Services

```bash
# Development (default)
./scripts/start.sh

# Development (explicit)
./scripts/start.sh --dev

# Production
./scripts/start.sh --prod

# Production (detached)
./scripts/start.sh --prod -d
```

### Manage Services

```bash
# Stop services
./scripts/start.sh --down
./scripts/start.sh --prod --down

# View logs
./scripts/start.sh --logs
./scripts/start.sh --prod --logs

# View status
./scripts/start.sh --ps
./scripts/start.sh --prod --ps
```

### Direct npm Scripts

```bash
# Install dependencies
npm install

# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Dev (without Docker — requires local DB & Redis)
npm run start:dev:api
npm run start:dev:worker
npm run start:dev:browser
```

---

## 🛠️ Database Setup (First Time Only)

On first launch, Docker automatically:

1. Creates the PostgreSQL database with extensions:
   - **pgvector** — Vector similarity search
   - **pg_trgm** — Trigram text search
   - **uuid-ossp** — UUID generation
2. Creates the replication user
3. Configures streaming replication to the replica
4. Runs Prisma migrations (prod mode)

To apply custom indexes manually:

```bash
# Connect to the running DB container
docker exec -i catchy-db psql -U catchy_dev -d catchy_development < scripts/create-product-indexes.sql
```

---

## ✅ Verification

### 1. Health Check

```bash
curl http://localhost:3000/health \
  -H "X-API-Key: dev-api-key-change-in-production"
```

### 2. Submit a Scrape Job

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -d '{
    "url": "https://meesho.com",
    "domain": "meesho.com"
  }'
```

### 3. Backend API (Login)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│                  Docker Network                   │
│                                                    │
│  ┌─────────┐  ┌──────────────┐  ┌──────────┐    │
│  │   db    │──│  db-replica   │  │  redis   │    │
│  │ (PG 16) │  │  (PG 16)     │  │ (7-alp)  │    │
│  └────┬────┘  └──────────────┘  └────┬─────┘    │
│       │                               │           │
│  ┌────┴────────────────────────┬─────┘           │
│  │                              │                 │
│  ▼                              ▼                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   api    │  │  worker   │  │browser-service│  │
│  │ (NestJS) │  │ (NestJS)  │  │  (NestJS +    │  │
│  │ :3000    │  │           │  │  Playwright)  │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 📖 Key Documentation

- **API Reference**: [README.md](./README.md)
- **Strategies**: `src/shared/domain/config/domain-strategies.json`
