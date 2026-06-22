import { cookies } from "next/headers";

const API = process.env.API_URL;
const IS_PROD = process.env.NODE_ENV === "production";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "strict" as const,
  path: "/",
};

export async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refresh = cookieStore.get("refresh_token")?.value;
  if (!refresh) return null;

  const res = await fetch(`${API}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
    return null;
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  // Cookie outlives the 1h JWT so an expired access token gets refreshed
  // (proxy.ts / apiFetch) instead of looking like a logout.
  cookieStore.set("access_token", data.access, {
    ...COOKIE_OPTS,
    maxAge: 60 * 60 * 24 * 7,
  });
  if (data.refresh) {
    cookieStore.set("refresh_token", data.refresh, {
      ...COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return data.access;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  let token = cookieStore.get("access_token")?.value;
  if (!token) {
    const newToken = await refreshAccessToken();
    if (!newToken)
      return Response.json({ detail: "Unauthorized" }, { status: 401 });
    token = newToken;
  }

  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${t}`,
    },
  });

  let res = await fetch(`${API}${path}`, withAuth(token));

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken)
      return Response.json({ detail: "Unauthorized" }, { status: 401 });
    res = await fetch(`${API}${path}`, withAuth(newToken));
  }

  return res;
}
