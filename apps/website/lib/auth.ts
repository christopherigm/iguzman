const ACCESS_TOKEN_KEY = 'auth_access';
const REFRESH_TOKEN_KEY = 'auth_refresh';

export function storeTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export interface LoginPayload {
  email: string;
  password: string;
  system_id: number;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export class LoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Login failed');
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const res = await fetch(`${apiUrl}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new LoginError(res.status, data);
  }

  return res.json() as Promise<LoginResponse>;
}
