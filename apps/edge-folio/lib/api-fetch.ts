import { cookies } from 'next/headers';

const API = process.env.API_URL;
const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_OPTS = { httpOnly: true, secure: IS_PROD, sameSite: 'strict' as const, path: '/' };

// Wraps fetch so a transport-level failure (ETIMEDOUT, ECONNREFUSED, DNS) returns
// null instead of throwing an unhandled "TypeError: fetch failed" out of the route
// handler — lets callers degrade to a 503 rather than crashing the request.
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refresh = cookieStore.get('refresh_token')?.value;
  if (!refresh) return null;

  const res = await safeFetch(`${API}/api/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  // A transient network error must not look like an invalid refresh token, or we
  // would clear cookies and log the user out on a blip. Keep cookies; caller 401s.
  if (!res) return null;

  if (!res.ok) {
    cookieStore.delete('access_token');
    cookieStore.delete('refresh_token');
    return null;
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  // Cookie outlives the 1h JWT so an expired access token gets refreshed
  // (proxy.ts / apiFetch) instead of looking like a logout.
  cookieStore.set('access_token', data.access, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });
  if (data.refresh) {
    cookieStore.set('refresh_token', data.refresh, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });
  }
  return data.access;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  let token = cookieStore.get('access_token')?.value;
  if (!token) {
    const newToken = await refreshAccessToken();
    if (!newToken) return Response.json({ detail: 'Unauthorized' }, { status: 401 });
    token = newToken;
  }

  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` },
  });

  let res = await safeFetch(`${API}${path}`, withAuth(token));
  if (!res) return Response.json({ detail: 'Service unavailable' }, { status: 503 });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return Response.json({ detail: 'Unauthorized' }, { status: 401 });
    res = await safeFetch(`${API}${path}`, withAuth(newToken));
    if (!res) return Response.json({ detail: 'Service unavailable' }, { status: 503 });
  }

  return res;
}
