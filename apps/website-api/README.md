# website-api

Django REST Framework backend with JWT authentication.

## Requirements

- Python 3.10+
- Django 5.2
- djangorestframework
- djangorestframework-simplejwt
- Pillow

## Setup

```bash
# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Apply migrations and start the server
python3 manage.py migrate
python3 manage.py runserver
```

The server runs at `http://localhost:8000` by default.

---

## Authentication

This API uses **JWT (JSON Web Token)** authentication via [SimpleJWT](https://django-rest-framework-simplejwt.readthedocs.io/).

- **Access token** expires in **60 minutes**.
- **Refresh token** expires in **7 days** and is rotated on every use.
- Protected endpoints require the following header:

```
Authorization: Bearer <access_token>
```

---

## URL Reference

### Admin & Internal

| URL               | Description                                   |
| ----------------- | --------------------------------------------- |
| `/admin/`         | Django admin panel                            |
| `/api-auth/`      | DRF browsable API login/logout (session auth) |
| `/jet/`           | Django JET admin skin URLs                    |
| `/jet/dashboard/` | Django JET dashboard URLs                     |

---

### Authentication Endpoints — `/api/auth/`

All authentication endpoints are **public** (no token required).

---

#### `POST /api/auth/signup/`

Register a new user account.

**Request body:**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "StrongPass123!",
  "password2": "StrongPass123!",
  "first_name": "John",
  "last_name": "Doe"
}
```

> `first_name` and `last_name` are optional. `email` is required.

**Successful response — `201 Created`:**

```json
{
  "id": 1,
  "username": "johndoe",
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Validation error example — `400 Bad Request`:**

```json
{
  "password": ["Passwords do not match."]
}
```

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/auth/signup/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "StrongPass123!",
    "password2": "StrongPass123!"
  }'
```

---

#### `POST /api/auth/login/`

Authenticate with username and password. Returns a JWT access token and refresh token.

The access token payload includes custom claims: `username` and `email`.

**Request body:**

```json
{
  "username": "johndoe",
  "password": "StrongPass123!"
}
```

**Successful response — `200 OK`:**

```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Invalid credentials — `401 Unauthorized`:**

```json
{
  "detail": "No active account found with the given credentials"
}
```

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "StrongPass123!"
  }'
```

---

#### `POST /api/auth/token/refresh/`

Get a new access token using a valid refresh token. The refresh token is rotated on every use (a new one is issued).

**Request body:**

```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Successful response — `200 OK`:**

```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Expired or invalid token — `401 Unauthorized`:**

```json
{
  "detail": "Token is invalid or expired",
  "code": "token_not_valid"
}
```

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

#### `POST /api/auth/token/verify/`

Check whether a given token (access or refresh) is still valid.

**Request body:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Token is valid — `200 OK`:**

```json
{}
```

**Token is invalid or expired — `401 Unauthorized`:**

```json
{
  "detail": "Token is invalid or expired",
  "code": "token_not_valid"
}
```

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/auth/token/verify/ \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

#### `GET /api/auth/profile/`

Return the authenticated user's profile data, including their profile picture URL.

**Requires:** `Authorization: Bearer <access_token>`

**Successful response — `200 OK`:**

```json
{
  "id": 1,
  "username": "johndoe",
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "profile_picture": "http://localhost:8000/media/profile_pictures/user_1/profile_1.jpg"
}
```

> `profile_picture` is `null` when no picture has been uploaded yet.

**cURL example:**

```bash
curl http://localhost:8000/api/auth/profile/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### `POST /api/auth/profile/picture/`

Upload a profile picture as a **base64-encoded image**. The image is automatically resized to a maximum of **512×512 px** at **90% JPEG quality** before being stored.

**Requires:** `Authorization: Bearer <access_token>`

**Request body:**

```json
{
  "base64_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

> The `data:image/...;base64,` prefix is optional — a raw base64 string is also accepted.

**Successful response — `200 OK`:**

```json
{
  "profile_picture": "http://localhost:8000/media/profile_pictures/user_1/profile_1.jpg"
}
```

**Validation error — `400 Bad Request`:**

```json
{
  "base64_image": ["The provided file is not a valid image."]
}
```

**cURL example:**

```bash
curl -X POST http://localhost:8000/api/auth/profile/picture/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"base64_image": "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."}'
```

---

## Calling a Protected Endpoint

Once you have an access token, include it in every request to protected endpoints:

```bash
curl http://localhost:8000/api/some-protected-resource/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Missing or expired token returns `401 Unauthorized`:

```json
{
  "detail": "Authentication credentials were not provided."
}
```

---

## Typical Authentication Flow

```
1. POST /api/auth/signup/           → create account
2. POST /api/auth/login/            → receive access + refresh tokens
3. GET  /api/<protected>/           → use access token in Authorization header
4. POST /api/auth/token/refresh/    → when access token expires, get a new one
5. GET  /api/auth/profile/          → retrieve user profile data
6. POST /api/auth/profile/picture/  → upload / update profile picture (base64)
```
