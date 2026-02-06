# http-client

Type-safe HTTP client wrapping the native `fetch` API with JWT authentication, proper typing, and optional JSON:API response denormalization.

## Features

- JWT Bearer token authentication on every request
- Type-safe response envelopes via `HttpClientResult<T>`
- Optional JSON:API denormalization (`jsonapi: true`) using `rebuildJsonApiResponse()`
- Custom `HttpClientError` with parsed error body for non-OK responses
- Query parameter serialization for GET/DELETE
- JSON body serialization for POST/PUT/PATCH
- Zero external dependencies — uses Node.js built-in `fetch` (Node 18+)

## Usage

```ts
import { httpGet, httpPost, HttpClientError } from '@iguzman/helpers';

// Simple GET
const users = await httpGet<User[]>({
  baseUrl: 'https://api.example.com',
  url: '/users',
  token: 'my-jwt-token',
});
console.log(users.data); // User[]

// GET with query params
const filtered = await httpGet<User[]>({
  url: '/users',
  token: 'my-jwt-token',
  query: { page: 1, active: true },
});

// POST with body
const created = await httpPost<User>({
  url: '/users',
  token: 'my-jwt-token',
  body: { name: 'Jane', email: 'jane@example.com' },
});

// JSON:API mode — return type narrows to HttpClientResult<JsonApiResponse>
const articles = await httpGet({
  url: '/articles?include=author',
  token: 'my-jwt-token',
  jsonapi: true,
});
console.log(articles.data); // JsonApiResponse (denormalized)

// Error handling
try {
  await httpGet({ url: '/protected', token: 'expired-token' });
} catch (err) {
  if (err instanceof HttpClientError) {
    console.error(err.status);     // 401
    console.error(err.statusText); // "Unauthorized"
    console.error(err.data);       // parsed JSON error body or null
  }
}
```

## Base URL Resolution

The `baseUrl` option is resolved in this order:

1. Explicit `baseUrl` passed in options
2. `process.env.BASE_URL`

If neither is available, an error is thrown.

## API

### Functions

| Function       | HTTP Method | Body | Query | Notes                      |
| -------------- | ----------- | ---- | ----- | -------------------------- |
| `httpGet()`    | GET         | No   | Yes   |                            |
| `httpPost()`   | POST        | Yes  | No    |                            |
| `httpPut()`    | PUT         | Yes  | No    |                            |
| `httpPatch()`  | PATCH       | Yes  | No    |                            |
| `httpDelete()` | DELETE      | No   | Yes   | Returns `null` data on 204 |

### `HttpClientResult<T>`

```ts
interface HttpClientResult<T> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}
```

### `HttpClientError`

Thrown for responses with `status >= 400`. Properties:

- `status` — HTTP status code
- `statusText` — HTTP status text
- `url` — The full request URL
- `data` — Parsed JSON error body, or `null` if parsing failed
