# website-api

Django REST Framework backend with JWT authentication.

## Requirements

- Python 3.10+
- Django 5.2
- djangorestframework
- djangorestframework-simplejwt
- Pillow
- django-redis

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

| URL          | Description                                   |
| ------------ | --------------------------------------------- |
| `/admin/`    | Django admin panel                            |
| `/api-auth/` | DRF browsable API login/logout (session auth) |

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

#### `PUT /api/auth/profile/`

Update the authenticated user's profile fields. All fields are optional — only send the ones you want to change.

**Requires:** `Authorization: Bearer <access_token>`

**Request body (all fields optional):**

```json
{
  "username": "newusername",
  "email": "new@example.com",
  "first_name": "Jane",
  "last_name": "Smith"
}
```

**Successful response — `200 OK`:** *(same shape as `GET /api/auth/profile/`)*

```json
{
  "id": 1,
  "username": "newusername",
  "email": "new@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "profile_picture": "http://localhost:8000/media/profile_pictures/user_1/profile_1.jpg"
}
```

**Validation error — `400 Bad Request`:**

```json
{
  "username": ["This username is already taken."]
}
```

**cURL example:**

```bash
curl -X PUT http://localhost:8000/api/auth/profile/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"first_name": "Jane", "last_name": "Smith"}'
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
6. PUT  /api/auth/profile/          → update username, email, first_name, last_name
7. POST /api/auth/profile/picture/  → upload / update profile picture (base64)
```

---

## Deployment

The app is containerized with Docker and deployed to MicroK8s via a Helm chart located at `helm/`.

### Prerequisites

- Docker
- `kubectl` connected to the target cluster
- `helm` 3.x
- `pnpm` (for monorepo scripts run from the repo root)

### Environment variables

Configure production values as a Kubernetes Secret and reference them in `helm/values.yaml` via `envFromSecret`:

| Variable                 | Source          | Description                                                                      |
| ------------------------ | --------------- | -------------------------------------------------------------------------------- |
| `DB_HOST`                | `env`           | PostgreSQL host (set by Helm chart)                                              |
| `DB_PORT`                | `env`           | PostgreSQL port (default: `5432`)                                                |
| `DB_NAME`                | `env`           | Database name (default: `website`)                                               |
| `DB_USER`                | `env`           | Database user (default: `website`)                                               |
| `DB_PASSWORD`            | `envFromSecret` | Database password — stored in K8s Secret                                         |
| `REDIS_URL`              | `env`           | Redis connection URL (default: `redis://redis.website.svc.cluster.local:6379/0`) |
| `REDIS_PASSWORD`         | `envFromSecret` | Redis password — required only when Redis auth is enabled                        |
| `MEDIA_ROOT`             | `env`           | Override media path (default: `/app/media`)                                      |
| `SECRET_KEY`             | `envFromSecret` | Django secret key (required in production)                                       |
| `DEBUG`                  | `env`           | Set to `False` in production                                                     |
| `ALLOWED_HOSTS`          | `env`           | Comma-separated list of allowed hostnames                                        |
| `CSRF_TRUSTED_ORIGINS`   | `env`           | Comma-separated list of allowed origins                                          |
| `DJANGO_SETTINGS_MODULE` | `env`           | Set automatically by the Helm chart                                              |

### Redis

Redis is deployed as a **standalone service** using the shared Helm chart at `packages/charts/redis/`. It must be running in the same namespace before the Django app starts.

Django connects to Redis via the `REDIS_URL` environment variable (default: `redis://redis.website.svc.cluster.local:6379/0`). When `REDIS_URL` is set:

- `CACHES['default']` uses `django_redis.cache.RedisCache` (in-memory cache falls back when Redis is absent in local dev).
- `SESSION_ENGINE` is switched to `django.contrib.sessions.backends.cache`, storing sessions in Redis instead of the database.

#### Deploy Redis

```bash
# Without authentication (development clusters)
helm install redis ./packages/charts/redis --namespace website --create-namespace

# With password authentication (recommended for production)
helm install redis ./packages/charts/redis \
  --namespace website --create-namespace \
  --set auth.password=your-redis-password
```

#### Enable Redis auth in website-api

If you deploy Redis with a password, uncomment the `REDIS_PASSWORD` entry in `helm/values.yaml`:

```yaml
envFromSecret:
  - name: REDIS_PASSWORD
    secretName: website-api-secrets
    secretKey: redis-password
```

Then add the Redis password to the existing secret (or recreate it):

```bash
kubectl create secret generic website-api-secrets \
  --namespace website \
  --from-literal=db-password='postgres' \
  --from-literal=secret-key='your-production-secret-key' \
  --from-literal=redis-password='your-redis-password'
```

#### Verify Redis is reachable

```bash
kubectl exec deploy/website-api -n website -- \
  python -c "from django.core.cache import cache; cache.set('ping','pong',10); print(cache.get('ping'))"
```

Create the secret on the cluster before deploying:

```bash
kubectl create secret generic website-api-secrets \
  --namespace website \
  --from-literal=db-password='postgres' \
  --from-literal=secret-key='your-production-secret-key' \
  --from-literal=redis-password='your-redis-password'
```

The `DB_PASSWORD` secret key (`db-password`) is already wired in `helm/values.yaml` via `envFromSecret` and will be injected automatically on deployment.

### 1. Build and publish the Docker image

Run from the **monorepo root**:

```bash
pnpm docker website-api
```

This builds the multi-stage image, tags it, and optionally pushes it to the registry defined in `apps/website-api/.env`:

```bash
# apps/website-api/.env
DOCKER_REGISTRY=christopherguzman
NAMESPACE=website
```

The image is built in three stages:

1. **deps** — installs Python packages (including `psycopg2-binary`)
2. **builder** — runs `collectstatic` (WhiteNoise gzip-compresses assets)
3. **runner** — minimal production image with non-root user, gunicorn on port `8000`

### 2. Run database migrations

Migrations must be applied before (or immediately after) deploying a new version:

```bash
kubectl exec deploy/website-api -n website -- python manage.py migrate
```

### 3. Deploy with Helm

```bash
pnpm helm website-api
```

Or use the full one-command workflow (bump version → build → docker → helm):

```bash
pnpm deploy-app website-api
```

You will be prompted for the target namespace and image tag.

### Helm values

Key values to override in `helm/values.yaml` or via `--set`:

| Key                        | Default                                          | Description                       |
| -------------------------- | ------------------------------------------------ | --------------------------------- |
| `image.tag`                | `latest`                                         | Docker image tag to deploy        |
| `replicaCount`             | `1`                                              | Number of pod replicas            |
| `ingress.hosts[0].host`    | `website-api.iguzman.com.mx`                     | Public hostname                   |
| `env.REDIS_URL`            | `redis://redis.website.svc.cluster.local:6379/0` | Redis connection URL              |
| `hostPathVolume.enabled`   | `true`                                           | Mount shared media volume         |
| `hostPathVolume.mountPath` | `/app/media`                                     | Container path for media files    |
| `nginx.enabled`            | `true`                                           | Nginx sidecar for `/media/`       |
| `resources.limits.cpu`     | `500m`                                           | CPU limit for Django container    |
| `resources.limits.memory`  | `512Mi`                                          | Memory limit for Django container |

### Checking deployment status

```bash
# Release status
helm status website-api -n website

# Pod logs
kubectl logs deploy/website-api -n website
kubectl logs deploy/website-api -n website -c nginx   # nginx sidecar

# Live resource status
kubectl get pods,svc,ingress -n website -l app.kubernetes.io/name=website-api
```
