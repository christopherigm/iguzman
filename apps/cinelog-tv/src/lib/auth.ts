// TV session + device-pairing client. The TV has no keyboard-friendly login, so
// it follows an OAuth 2.0 device-authorization style flow: it asks the API for a
// short code, shows it on screen, and polls until the user authorizes it from
// the web app at <WEB_URL>/tv. The resulting JWTs are kept in localStorage and
// the access token authorizes the catalog requests (only the user's library).

import { API_URL } from "./config";

const ACCESS_KEY = "cinelog_tv_access";
const REFRESH_KEY = "cinelog_tv_refresh";

export interface DeviceCode {
  /** Short code shown on the TV and typed by the user in the web app. */
  user_code: string;
  /** Opaque secret the TV polls with. */
  device_code: string;
  /** Seconds until the code expires. */
  expires_in: number;
  /** Seconds the TV should wait between polls. */
  interval: number;
}

export type PollResult =
  | { status: "pending" }
  | { status: "authorized"; access: string; refresh: string }
  | { status: "expired" };

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function hasSession(): boolean {
  return getAccessToken() !== null;
}

export function setSession(access: string, refresh: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // Storage unavailable (private mode / quota): the session simply won't
    // persist; the caller keeps it in memory for this run.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Ignore - nothing to clear.
  }
}

/** Request a fresh pairing code from the API. */
export async function requestDeviceCode(): Promise<DeviceCode> {
  const res = await fetch(`${API_URL}/api/auth/tv/device/`, { method: "POST" });
  if (!res.ok) throw new Error(`requestDeviceCode failed: ${res.status}`);
  return res.json() as Promise<DeviceCode>;
}

/** Poll once for the pairing status. */
export async function pollToken(deviceCode: string): Promise<PollResult> {
  const res = await fetch(`${API_URL}/api/auth/tv/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  // The API returns 400 with {status:"expired"} for a stale/unknown code.
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    access?: string;
    refresh?: string;
  };

  if (data.status === "authorized" && data.access && data.refresh) {
    return { status: "authorized", access: data.access, refresh: data.refresh };
  }
  if (data.status === "pending") return { status: "pending" };
  return { status: "expired" };
}

/**
 * Exchange the stored refresh token for a new access token (re-extending the
 * long-lived TV window). Returns the new access token, or null when the refresh
 * is gone/invalid - in which case the session is cleared so the caller re-pairs.
 */
export async function refreshSession(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/tv/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = (await res.json()) as { access: string; refresh: string };
    setSession(data.access, data.refresh);
    return data.access;
  } catch {
    return null;
  }
}
