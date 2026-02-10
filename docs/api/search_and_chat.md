# Search & Chat API Documentation

This document outlines the API endpoints for the Search and Chat functionality.

## Overview

The search system is stateful. Initiating a search creates a "Chat" session. Users can then refine their search results using natural language messages within that chat session.

---

## Authentication

All endpoints described below require authentication. You must include a valid JWT token in the request header.

**Header:**
`Authorization: Bearer <your-jwt-token>`

---

## 1. Initial Search

**Endpoint:** `GET /search`

Initiates a new search. If results exist in the database, they are returned immediately (ordered by relevance). If no results are found, the system performs a live scrape across integrated retailers, persists the data, and enriches the top results with full details before returning.

**Query Parameters:**

- `query`: (Required) The search term.
- `lastScore`: (Optional) The similarity score from the last item of the previous page (for pagination).
- `lastId`: (Optional) The product ID from the last item of the previous page (for pagination).
- `limit`: (Optional) Number of results to return (default: 20).

**Response:**

```json
{
  "source": "database", // or "live_scrape"
  "products": [
    {
      "id": "uuid...",
      "title": "Red Satin Dress",
      "price": 1200,
      "brand": "Brand Name",
      "category": "Dresses",
      "similarity": 0.9854, // Relevance score (no longer thresholded)
      "images": ["url..."],
      "productUrl": "url...",
      "retailer": "myntra",
      "scrapStatus": "DETAILED", // Live results are enriched to DETAILED status
      "lastScraped": "2024-02-10T..."
    }
  ],
  "total": 150,
  "nextCursor": {
    "score": 0.9123,
    "id": "uuid..."
  },
  "hasMore": true,
  "chatId": "c123-456-uuid", // Save this for chat session interactions
  "message": "Here are the products matching your query"
}
```

---

## 2. Refine Search (Chat Message)

**Endpoint:** `POST /chat/:chatId/message`

Send a natural language message to refine the search. The system uses an LLM to extract intent (filters) and updates the search state.

**URL Parameters:**

- `chatId`: The ID returned from the `/search` endpoint.

**Request Body:**

```json
{
  "text": "under 1000 rupees" // The user's natural language refinement
}
```

**Response:**
Returns a filtered list of products and a conversational message.

```json
{
  "chatId": "c123-456-uuid",
  "products": [
    {
      "title": "Cheap Red Dress",
      "price": 800,
      "similarity": 0.95,
      ...
    }
  ],
  "message": "Here are some red dress options. Filters: {\"price_max\": 1000}",
  "nextCursor": 0.85,
  "hasMore": true
}
```

---

## 3. Get Chat Results (Pagination)

**Endpoint:** `GET /chat/:chatId/results`

Fetch the next page of results for an existing chat session. This maintains the current filters (state) of the chat.

**URL Parameters:**

- `chatId`: The ID of the chat.

**Query Parameters:**

- `lastScore`: The `score` value from `nextCursor` of the previous page.
- `lastId`: The `id` value from `nextCursor` of the previous page.
- `limit`: Number of items to fetch (default: 20).

**Example Request:**
`GET /chat/c123-456-uuid/results?lastScore=0.85&lastId=uuid...&limit=20`

**Response:**

```json
{
  "chatId": "c123-456-uuid",
  "products": [ ... next set of products ... ],
  "nextCursor": {
    "score": 0.82,
    "id": "uuid..."
  },
  "hasMore": true
}
```

---

## 4. Get Chat History

**Endpoint:** `GET /chat/:chatId`

Retrieve the full details of a chat, including message history and current filter state.

**URL Parameters:**

- `chatId`: The ID of the chat.

**Response:**

```json
{
  "id": "c123-456-uuid",
  "title": "red dress",
  "createdAt": "2024-02-03T10:00:00Z",
  "messages": [
    { "role": "user", "content": "red dress", "createdAt": "..." },
    { "role": "user", "content": "under 1000 rupees", "createdAt": "..." },
    {
      "role": "assistant",
      "content": "Here are some options...",
      "createdAt": "..."
    }
  ],
  "state": {
    "currentQuery": "red dress",
    "filters": { "price_max": 1000 }
  }
}
```

---

## 5. Get User Chats

**Endpoint:** `GET /chat`

Retrieve all chat sessions for the authenticated user, ordered by most recent first.

**Response:**

```json
[
  {
    "id": "c123-456-uuid",
    "userId": "u789-012-uuid",
    "title": "red dress",
    "createdAt": "2024-02-03T10:00:00Z",
    "state": {
      "chatId": "c123-456-uuid",
      "currentQuery": "red dress",
      "filters": { "price_max": 1000 }
    }
  },
  {
    "id": "c987-654-uuid",
    "userId": "u789-012-uuid",
    "title": "blue jeans",
    "createdAt": "2024-02-02T14:30:00Z",
    "state": {
      "chatId": "c987-654-uuid",
      "currentQuery": "blue jeans",
      "filters": {}
    }
  }
]
```
