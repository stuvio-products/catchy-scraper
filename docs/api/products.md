# Product Search API

Search for products across Flipkart and Myntra using text queries or image-based AI search.

## Endpoints

### POST /products/search

Universal search endpoint - accepts either text query or image.

**Request Body:**

```json
// Text search
{
  "query": "red dress",
  "limit": 10
}

// Image search (Gemini AI analyzes the image)
{
  "image": "<base64-encoded-image>",
  "limit": 10
}
```

**Response:**

```json
{
  "searchQuery": "red dress",
  "products": [
    {
      "name": "Product Name",
      "price": "₹999",
      "image": "https://example.com/image.jpg",
      "productLink": "https://myntra.com/product/123",
      "brand": "Brand Name"
    }
  ],
  "total": 10
}
```

### POST /products/search/text

Text-only search endpoint.

```json
{
  "query": "running shoes",
  "limit": 5
}
```

### POST /products/search/image

Image-only search endpoint. Gemini AI converts the image to a search query.

```json
{
  "image": "<base64-encoded-image>",
  "limit": 5
}
```

## How It Works

1. **Text Search**: Query is sent directly to Flipkart + Myntra scrapers
2. **Image Search**: 
   - Image is sent to Gemini AI
   - Gemini returns a search query (e.g., "blue denim jacket")
   - Query is used to search Flipkart + Myntra

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRAPER_SERVICE_URL` | URL of the Python scraper service | `http://scraper-service:8000` |
| `GEMINI_API_KEY` | Google Gemini API key for image analysis | Required for image search |

## Example Usage

```bash
# Text search
curl -X POST http://localhost:3000/products/search \
  -H "Content-Type: application/json" \
  -d '{"query": "shoes", "limit": 5}'

# Image search (with base64 image)
curl -X POST http://localhost:3000/products/search \
  -H "Content-Type: application/json" \
  -d '{"image": "/9j/4AAQSkZJRg...", "limit": 5}'
```

## Architecture

```
NestJS Backend (port 3000)
    │
    ▼
Python Scraper Service (port 8000)
    │
    ├── Flipkart Scraper (Crawl4AI)
    ├── Myntra Scraper (Crawl4AI)
    └── Gemini Image Analysis
```

## Notes

- Scrapers use Crawl4AI with Playwright for JavaScript-rendered pages
- Results are combined from both platforms
- CSS selectors may need updates if e-commerce sites change their HTML structure
