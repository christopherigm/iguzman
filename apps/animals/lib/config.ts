/**
 * Server-only configuration.
 *
 * `API_URL` is deliberately **not** `NEXT_PUBLIC_` - every consumer is a server
 * component or a route handler, so the API host never needs to reach the
 * browser (and a `NEXT_PUBLIC_` value would be baked in at build time rather
 * than read at runtime).
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:8000';
