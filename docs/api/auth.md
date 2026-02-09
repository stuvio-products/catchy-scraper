# Auth API Documentation

Base URL: `/auth`

## Endpoints

### POST /auth/signup

Register a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword",
  "firstName": "John",
  "lastName": "Doe"
}
```

| Field     | Type   | Required | Validation           |
| --------- | ------ | -------- | -------------------- |
| email     | string | ✅       | Must be valid email  |
| password  | string | ✅       | Minimum 8 characters |
| firstName | string | ✅       | Non-empty            |
| lastName  | string | ✅       | Non-empty            |

**Response (201):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2026-01-28T10:20:39.229Z"
  }
}
```

**Errors:**

- `409 Conflict` - User with this email already exists

---

### POST /auth/login

Authenticate and receive JWT token.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2026-01-28T10:20:39.229Z"
  }
}
```

**Errors:**

- `401 Unauthorized` - Invalid credentials

---

### GET /auth/me

Get the currently authenticated user's profile.

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
  "createdAt": "2026-01-28T10:20:39.229Z"
}
```

**Errors:**

- `401 Unauthorized` - Missing or invalid token

---

### POST /auth/refresh

Refresh the authentication token.

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Response (200):** Same as `POST /auth/login`

---

### POST /auth/reset-password

Change password for an authenticated user.

**Headers:**

```
Authorization: Bearer <accessToken>
```

**Request Body:**

```json
{
  "oldPassword": "oldpassword",
  "newPassword": "newpassword",
  "confirmNewPassword": "newpassword"
}
```

**Response (200):**

```json
{
  "message": "Password reset successful"
}
```

**Errors:**

- `400 Bad Request` - Passwords do not match or invalid old password
- `401 Unauthorized` - Missing or invalid token

---

### POST /auth/forgot-password

Request a password reset OTP.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200):**

```json
{
  "message": "OTP sent to your email"
}
```

**Notes:** For security, this endpoint returns the same message even if the email does not exist in the system.

---

### POST /auth/resend-otp

Resend a password reset OTP.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200):**

```json
{
  "message": "OTP sent to your email"
}
```

**Errors:**

- `400 Bad Request` - Throttled (wait 1 minute between requests)

---

### POST /auth/reset-forgotten-password

Reset password using an OTP.

**Request Body:**

```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword"
}
```

**Response (200):**

```json
{
  "message": "Password has been reset successfully"
}
```

**Errors:**

- `400 Bad Request` - Invalid or expired OTP
- `404 Not Found` - User not found

---

## Authentication

All protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Tokens are valid for **7 days** after issuance.
