# Scraping Infrastructure

Production-grade web scraping system using NestJS + Playwright + Fetch, designed for AI-driven workflows with cost-aware proxy management and domain-based routing.

## Architecture

Multi-container architecture with:

- **API Container**: HTTP REST API for job submission
- **Worker Container(s)**: Process scraping jobs (horizontally scalable)
- **Browser Service Container**: Manages Playwright browser pool (internal only)
- **Redis Container**: Shared queue using BullMQ

## Features

✅ **Dual Scraping Modes**

- Fetch-based scraping for static content (fast, cheap)
- Browser-based scraping with Playwright for JavaScript-rendered pages

✅ **Domain-Aware Routing**

- Automatic strategy selection based on domain configuration
- Extendable via JSON configuration

✅ **Browser Pool Management**

- Long-running browser instances with proxy rotation
- Health monitoring and auto-respawn
- Browser reuse for efficiency

✅ **Cost-Aware Proxy System**

- Proxy provider interface for easy swapping
- Sticky sessions per domain
- Failure tracking and rotation

✅ **Scalable Queue System**

- BullMQ for reliable job processing
- Automatic retries with exponential backoff
- Horizontal worker scaling

## Quick Start

### 1. Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)

### 2. Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your API keys:

```bash
API_KEY=your-secure-api-key-here
BROWSER_SERVICE_API_KEY=your-internal-service-key
```

### 3. Run with Docker

**Development:**

```bash
docker-compose up
```

**Production:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Usage

**Submit a scrape job:**

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secure-api-key-here" \
  -d '{
    "url": "https://example.com",
    "domain": "example.com"
  }'
```

**Check job status:**

```bash
curl http://localhost:3000/api/scrape/{jobId} \
  -H "X-API-Key: your-secure-api-key-here"
```

**Health check:**

```bash
curl http://localhost:3000/api/health \
  -H "X-API-Key: your-secure-api-key-here"
```

## Local Development

### Install Dependencies

```bash
npm install
```

### Start Services

**Terminal 1 - Redis:**

```bash
docker run -p 6379:6379 redis:7-alpine
```

**Terminal 2 - Browser Service:**

```bash
npm run start:dev:browser
```

**Terminal 3 - Worker:**

```bash
npm run start:dev:worker
```

**Terminal 4 - API:**

```bash
npm run start:dev:api
```

## Configuration

### Domain Strategy Mapping

Edit `src/shared/domain/config/domain-strategies.json`:

```json
{
  "example.com": "FETCH",
  "amazon.in": "BROWSER",
  "flipkart.com": "BROWSER"
}
```

- `FETCH`: Use HTTP client (fast, cheap)
- `BROWSER`: Use Playwright browser (handles JavaScript)

### Environment Variables

| Variable             | Description            | Default   |
| -------------------- | ---------------------- | --------- |
| `API_PORT`           | API server port        | 3000      |
| `API_KEY`            | API authentication key | -         |
| `WORKER_CONCURRENCY` | Jobs per worker        | 4         |
| `BROWSER_COUNT`      | Browsers in pool       | 4         |
| `BROWSER_HEADLESS`   | Run browsers headless  | true      |
| `REDIS_HOST`         | Redis hostname         | localhost |

## Scaling

### Scale Workers

```bash
docker-compose up --scale worker=5
```

### Scale Browser Service

Edit `docker-compose.yml` and increase `BROWSER_COUNT`:

```yaml
browser-service:
  environment:
    BROWSER_COUNT: 8
```

## Monitoring

### Check Queue Status

```bash
docker exec -it scraper-redis redis-cli
> LLEN bull:scrape-queue:wait
```

### View Logs

```bash
docker-compose logs -f worker
docker-compose logs -f browser-service
```

## Production Deployment

### Build Images

```bash
docker-compose build
```

### Tag and Push

```bash
docker tag scraper-service_api:latest your-registry/scraper-api:v1.0.0
docker push your-registry/scraper-api:v1.0.0
```

### Deploy with Resource Limits

Use `docker-compose.prod.yml` which includes:

- Memory limits
- CPU limits
- Multiple replicas
- Resource constraints

## Architecture Decisions

### Why Separate Containers?

- **API** can scale independently based on traffic
- **Workers** can scale based on queue depth
- **Browser Service** isolation prevents crashes from affecting API
- Better resource allocation and monitoring

### Why BullMQ?

- Redis-backed reliability
- Automatic retries
- Job prioritization
- Built-in observability

### Why Dual Scraping Modes?

- **FETCH** is 10-100x faster and cheaper for static content
- **BROWSER** only used when JavaScript rendering is required
- Automatic routing based on domain configuration

## Troubleshooting

### Browsers not starting

Check browser service logs:

```bash
docker-compose logs browser-service
```

Ensure sufficient memory (2GB+ per browser).

### Jobs stuck in queue

Check worker logs:

```bash
docker-compose logs worker
```

Verify Redis connection and worker concurrency settings.

### API key errors

Ensure `X-API-Key` header matches `API_KEY` in environment.

## Future Enhancements

- [ ] Real proxy integration (Bright Data, Oxylabs)
- [ ] PostgreSQL result storage
- [ ] Webhook callbacks for job completion
- [ ] Prometheus metrics
- [ ] Kubernetes deployment
- [ ] Stealth mode for bot detection evasion

## License

MIT
