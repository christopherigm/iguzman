const ACCESS_TOKEN_KEY = 'auth_access';
const REFRESH_TOKEN_KEY = 'auth_refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('API request failed');
  }
}

export function storeTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  window.dispatchEvent(new CustomEvent('auth-changed'));
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

export interface TokenUser {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export function getUserFromToken(): TokenUser | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    return {
      firstName: typeof decoded.first_name === 'string' ? decoded.first_name : undefined,
      lastName: typeof decoded.last_name === 'string' ? decoded.last_name : undefined,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  } catch {
    return null;
  }
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

export interface SignUpPayload {
  email: string;
  password: string;
  password2: string;
  system_id: number;
  first_name?: string;
  last_name?: string;
}

export interface SignUpResponse {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  email_sent: boolean;
  detail: string;
}

export async function signUp(payload: SignUpPayload, apiUrl = ''): Promise<SignUpResponse> {
  const res = await fetch(`${apiUrl}/api/auth/signup/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }

  return res.json() as Promise<SignUpResponse>;
}

export async function requestPasswordReset(
  email: string,
  system_id: number,
  apiUrl = '',
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/auth/password-reset/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, system_id }),
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  newPassword2: string,
  apiUrl = '',
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/auth/password-reset/confirm/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword, new_password2: newPassword2 }),
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function verifyEmail(token: string, apiUrl = ''): Promise<void> {
  const res = await fetch(`${apiUrl}/api/auth/verify-email/${token}/`);

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function login(payload: LoginPayload, apiUrl = ''): Promise<LoginResponse> {
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
