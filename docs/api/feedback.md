# Feedback API

This document details the API endpoints for submitting user feedback.

**Base URL**: `/feedback`
**Authentication**: Required (Bearer Token)

## Endpoints

### 1. Submit Feedback

Allows authenticated users to submit feedback regarding the application.

- **URL**: `/feedback`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### Request Body

| Parameter | Type   | Required | Description                             |
| :-------- | :----- | :------- | :-------------------------------------- |
| `rating`  | number | Yes      | Rating from 1 to 5.                     |
| `topic`   | string | Yes      | Short topic or subject of the feedback. |
| `details` | string | No       | Detailed feedback message.              |

#### Example Request

```json
{
  "rating": 5,
  "topic": "Search Experience",
  "details": "I really like the new AI search feature!"
}
```

#### Success Response

**Code**: `201 Created`

```json
{
  "id": "f89d...",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "rating": 5,
  "topic": "Search Experience",
  "details": "I really like the new AI search feature!",
  "createdAt": "2023-10-27T10:00:00.000Z"
}
```
