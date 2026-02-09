# Collections and Saves API

This document details the API endpoints for managing user collections and saved products.

**Base URL**: `/collections`
**Authentication**: Required (Bearer Token)

## Endpoints

### 1. Save to Default Collection

Saves a product to the user's default collection (typically named "All Saves"). If the default collection does not exist, it is created automatically.

- **URL**: `/collections/default/save`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### Request Body

| Parameter   | Type   | Required | Description                  |
| :---------- | :----- | :------- | :--------------------------- |
| `productId` | string | Yes      | UUID of the product to save. |

#### Example Request

```json
{
  "productId": "123e4567-e89b-12d3-a456-426614174000"
}
```

#### Success Response

**Code**: `201 Created`

---

### 2. Save to Specific Collection

Saves a product to a specific user-created collection.

- **URL**: `/collections/:id/save`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### URL Parameters

| Parameter | Type   | Description                    |
| :-------- | :----- | :----------------------------- |
| `id`      | string | UUID of the target collection. |

#### Request Body

| Parameter   | Type   | Required | Description                  |
| :---------- | :----- | :------- | :--------------------------- |
| `productId` | string | Yes      | UUID of the product to save. |

#### Example Request

```json
{
  "productId": "123e4567-e89b-12d3-a456-426614174000"
}
```

#### Success Response

**Code**: `201 Created`

---

### 3. Create Collection

Creates a new custom collection.

- **URL**: `/collections`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### Request Body

| Parameter     | Type   | Required | Description             |
| :------------ | :----- | :------- | :---------------------- |
| `name`        | string | Yes      | Name of the collection. |
| `description` | string | No       | Optional description.   |

#### Example Request

```json
{
  "name": "Summer Outfits",
  "description": "Ideas for the upcoming trip"
}
```

#### Success Response

**Code**: `201 Created`

```json
{
  "id": "c456...",
  "userId": "u123...",
  "name": "Summer Outfits",
  "description": "Ideas for the upcoming trip",
  "createdAt": "..."
}
```

---

### 4. List Collections

Retrieves all collections for the authenticated user, including a preview of recently saved items.

- **URL**: `/collections`
- **Method**: `GET`
- **Auth Required**: Yes

#### Success Response

**Code**: `200 OK`

```json
[
  {
    "id": "c1...",
    "name": "All Saves",
    "savedProducts": [ ... ]
  },
  {
    "id": "c2...",
    "name": "Summer Outfits",
    "savedProducts": [ ... ]
  }
]
```

---

### 5. Get Collection Details

Retrieves details of a specific collection, including all saved products.

- **URL**: `/collections/:id`
- **Method**: `GET`
- **Auth Required**: Yes

#### URL Parameters

| Parameter | Type   | Description             |
| :-------- | :----- | :---------------------- |
| `id`      | string | UUID of the collection. |

#### Success Response

**Code**: `200 OK`

---

### 6. Update Collection

Updates the name or description of a collection.

- **URL**: `/collections/:id`
- **Method**: `PATCH`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### URL Parameters

| Parameter | Type   | Description             |
| :-------- | :----- | :---------------------- |
| `id`      | string | UUID of the collection. |

#### Request Body

| Parameter     | Type   | Required | Description      |
| :------------ | :----- | :------- | :--------------- |
| `name`        | string | No       | New name.        |
| `description` | string | No       | New description. |

#### Example Request

```json
{
  "name": "Winter Outfits"
}
```

#### Success Response

**Code**: `200 OK`

---

### 7. Delete Collection

Deletes a collection and all its saved entries (cascading delete).

- **URL**: `/collections/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes

#### URL Parameters

| Parameter | Type   | Description             |
| :-------- | :----- | :---------------------- |
| `id`      | string | UUID of the collection. |

#### Success Response

**Code**: `200 OK`

---

### 8. Unsave from Default Collection

Removes a product from the user's default collection ("All Saves").

- **URL**: `/collections/default/products/:productId`
- **Method**: `DELETE`
- **Auth Required**: Yes

#### URL Parameters

| Parameter   | Type   | Description                    |
| :---------- | :----- | :----------------------------- |
| `productId` | string | UUID of the product to unsave. |

#### Success Response

**Code**: `200 OK`
**Content**: The deleted saved product record.

---

### 9. Unsave from Specific Collection

Removes a product from a specific user-created collection.

- **URL**: `/collections/:id/products/:productId`
- **Method**: `DELETE`
- **Auth Required**: Yes

#### URL Parameters

| Parameter   | Type   | Description                    |
| :---------- | :----- | :----------------------------- |
| `id`        | string | UUID of the collection.        |
| `productId` | string | UUID of the product to unsave. |

#### Success Response

**Code**: `200 OK`
**Content**: The deleted saved product record.
