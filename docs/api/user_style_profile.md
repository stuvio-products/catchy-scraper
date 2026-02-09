# User Style Profile API

This document details the API endpoints for managing the user's style profile.

**Base URL**: `/users`
**Authentication**: Required (Bearer Token)

## Endpoints

### 1. Get User Style Profile

Retrieves the style profile for the authenticated user.

- **URL**: `/users/me/style-profile`
- **Method**: `GET`
- **Auth Required**: Yes

#### Success Response

**Code**: `200 OK`

**Example Response**:

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "genderPreference": "men",
  "styleVibe": ["casual", "streetWear"],
  "favoriteColorsHex": ["#000000", "#FFFFFF"],
  "topSize": "L",
  "bottomSize": "32",
  "shoeSize": "10",
  "favoriteBrands": ["Nike", "Adidas"],
  "updatedAt": "2023-10-27T10:00:00.000Z"
}
```

### 2. Create or Update User Style Profile

Creates a new style profile or updates the existing one for the authenticated user.

- **URL**: `/users/me/style-profile`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`

#### Request Body Parameters

| Parameter           | Type     | Required | Description                           | Enum / Example            |
| :------------------ | :------- | :------- | :------------------------------------ | :------------------------ |
| `genderPreference`  | string   | No       | User's gender preference for clothes. | `men`, `women`, `both`    |
| `styleVibe`         | string[] | No       | List of style vibes.                  | `["casual", "formal"]`    |
| `favoriteColorsHex` | string[] | No       | List of favorite colors in Hex.       | `["#FF0000"]`             |
| `topSize`           | string   | No       | User's top size.                      | `S`, `M`, `L`, `XL`, etc. |
| `bottomSize`        | string   | No       | User's bottom size.                   | `30`, `32`, `M`, etc.     |
| `shoeSize`          | string   | No       | User's shoe size.                     | `9`, `10`, `42`, etc.     |
| `favoriteBrands`    | string[] | No       | List of favorite brands.              | `["Zara", "H&M"]`         |

#### Example Request

```json
{
  "genderPreference": "women",
  "styleVibe": ["boho", "chic"],
  "favoriteColorsHex": ["#FFC0CB", "#FFFFFF"],
  "topSize": "S",
  "bottomSize": "28",
  "shoeSize": "7"
}
```

#### Success Response

**Code**: `200 OK` or `201 Created`

**Example Response**:

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "genderPreference": "women"
  // ... returns the updated object
}
```
