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

**Endpoint:** `POST /search`

Initiates a new search session. This creates a new Chat entity and returns the initial results along with a `chatId`.

**Request Body:**

```json
{
  "query": "red dress", // Required: The search term
  "limit": 10// Optional: Number of results (default: 10)
```

**Response:**

```json
{
  "query": "red dress",
  "products": [
    {
      "id": "uuid...",
      "title": "Red Satin Dress",
      "price": 1200,
      "similarity": 0.98,
      "images": ["url..."],
      "inStock": true,
      ...
    }
  ],
  "total": 10,
  "nextCursor": 0.91,      // Use this value for the 'cursor' param in next request
  "hasMore": true,
  "chatId": "c123-456-uuid", // IMPORTANT: Save this to use in /chat endpoints
  "message": "I found 10 items matching \"red dress\"."
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

- `cursor`: The `nextCursor` value from the previous page info.
- `limit`: Number of items to fetch (default: 10).

**Example Request:**
`GET /chat/c123-456-uuid/results?cursor=0.85&limit=10`

**Response:**

```json
{
  "chatId": "c123-456-uuid",
  "products": [ ... next set of products ... ],
  "nextCursor": 0.82,
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
