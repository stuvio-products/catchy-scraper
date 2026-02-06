# Getting Started: Scraper & Backend API

This guide provides step-by-step instructions to get the combined Scraper and Backend API infrastructure running locally.

## 📋 Prerequisites

- **Docker & Docker Compose**
- **Node.js 20+**
- **npm** (comes with Node.js)

---

## 🚀 Step 1: Initialize Environment

First, navigate to the service directory and set up your environment variables:

```bash
cd scraper-service
cp .env.example .env
```

Edit the `.env` file and provide values for:

- `GEMINI_API_KEY`: Required for Chat features and embeddings.
- `JWT_SECRET`: Any secure string for token signing.
- `EMAIL_PASS`: App password if you want to test password reset.

---

## 📦 Step 2: Install & Prepare Database

Install the unified dependencies and generate the Prisma client for the combined schema:

```bash
# Install dependencies
npm install

# Generate Prisma Client
npm run prisma:generate
```

---

## 🐳 Step 3: Launch Services

Start the entire infrastructure (DB, Redis, API, Worker, Browser Service) using Docker Compose:

```bash
# Build and start all containers
docker-compose up --build
```

**Wait for all services to become healthy.** You should see:

- `scraper-db` ready to accept connections.
- `scraper-redis` healthy.
- `scraper-api` running on port 3000.
- `scraper-browser-service` ready.

---

## 🛠️ Step 4: Database Setup (First Time Only)

Once the database container is up, run the migrations and create the necessary vector indexes:

```bash
# In a new terminal:
cd scraper-service

# Push the schema to the database
npx prisma db push

# Create optimized product and vector indexes
# Note: Ensure you have pgvector extension if using real production DB
# In docker-compose, postgres:15-alpine is used.
# For vector support, you might need a specialized image or manual extension enabling.
```

---

## ✅ Step 5: Verification

### 1. Health Check

```bash
curl http://localhost:3000/api/health \
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

## 📖 Key Documentation

- **API Reference**: [README.md](./README.md)
- **Architecture**: [walkthrough.md](../.gemini/antigravity/brain/44b687e3-cb67-48b2-8c7b-dd497fa1e08f/walkthrough.md)
- **Strategies**: `src/shared/domain/config/domain-strategies.json`
