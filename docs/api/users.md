# Users API Documentation

Base URL: `/users`

## Endpoints

---

### GET /users/me

Get the currently authenticated user's profile with style profile information.

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2026-01-28T10:20:39.229Z",
  "styleProfile": {
    "genderPreference": "men",
    "styleVibe": ["casual"],
    "favoriteColorsHex": ["#000000"],
    "topSize": "L",
    "bottomSize": "32",
    "shoeSize": "10",
    "favoriteBrands": ["Nike"]
  }
}
```

**Errors:**

- `401 Unauthorized` - Missing or invalid token

---

### PATCH /users/me

Update the currently authenticated user's profile information.

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:** (At least one field required)

```json
{
  "email": "newemail@example.com",
  "firstName": "NewName",
  "lastName": "NewLastName"
}
```

**Response (200):** Returns the updated `UserDto` (without style profile).

**Errors:**

- `400 Bad Request` - No fields provided or validation failed
- `401 Unauthorized` - Missing or invalid token
- `409 Conflict` - Email already in use

---

### DELETE /users/me

Soft delete the currently authenticated user's account.

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2026-01-28T10:20:39.229Z",
  "isDeleted": true
}
```

**Errors:**

- `401 Unauthorized` - Missing or invalid token

---

## Authorization

Protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```
