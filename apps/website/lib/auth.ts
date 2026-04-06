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
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  window.dispatchEvent(new CustomEvent('auth-changed'));
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export interface TokenUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
  systemId?: number;
}

export function getUserFromToken(): TokenUser | null {
  if (typeof window === 'undefined') return null;
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
      isAdmin: typeof decoded.is_admin === 'boolean' ? decoded.is_admin : false,
      systemId: typeof decoded.system_id === 'number' ? decoded.system_id : undefined,
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

export async function refreshTokens(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const res = await fetch(`/api/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  const newRefresh = data.refresh ?? refresh;
  storeTokens(data.access, newRefresh);
  return data.access;
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

export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
  system_id: number;
}

export async function getProfile(accessToken: string, apiUrl = ''): Promise<UserProfile> {
  const res = await fetch(`${apiUrl}/api/auth/profile/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function updateProfile(
  payload: { first_name?: string; last_name?: string },
  accessToken: string,
  apiUrl = '',
): Promise<UserProfile> {
  const res = await fetch(`${apiUrl}/api/auth/profile/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function uploadProfilePicture(
  base64Image: string,
  accessToken: string,
  apiUrl = '',
): Promise<{ profile_picture: string | null }> {
  const res = await fetch(`${apiUrl}/api/auth/profile/picture/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ base64_image: base64Image }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<{ profile_picture: string | null }>;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPassword2: string,
  accessToken: string,
  apiUrl = '',
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/auth/change-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      new_password2: newPassword2,
    }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

// ── Passkey (WebAuthn) ───────────────────────────────────────────────────────

export async function registerPasskey(
  apiUrl: string,
  accessToken: string,
  name = 'My passkey',
): Promise<{ id: number; name: string }> {
  const { startRegistration } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch(`${apiUrl}/api/auth/passkey/register/options/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!optionsRes.ok) {
    const data: Record<string, unknown> = await optionsRes.json().catch(() => ({}));
    throw new ApiError(optionsRes.status, data);
  }

  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startRegistration>[0]['optionsJSON'];
    challenge_id: string;
  };

  const credential = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch(`${apiUrl}/api/auth/passkey/register/verify/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ credential, challenge_id, name }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new ApiError(verifyRes.status, data);
  }

  return verifyRes.json() as Promise<{ id: number; name: string }>;
}

export async function loginWithPasskey(
  email: string,
  systemId: number,
  apiUrl = '',
): Promise<LoginResponse> {
  const { startAuthentication } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch(`${apiUrl}/api/auth/passkey/authenticate/options/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, system_id: systemId }),
  });
  if (!optionsRes.ok) {
    const data: Record<string, unknown> = await optionsRes.json().catch(() => ({}));
    throw new LoginError(optionsRes.status, data);
  }

  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
    challenge_id: string;
  };

  const credential = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch(`${apiUrl}/api/auth/passkey/authenticate/verify/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, system_id: systemId, credential, challenge_id }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new LoginError(verifyRes.status, data);
  }

  return verifyRes.json() as Promise<LoginResponse>;
}

export async function getPasskeyCredentials(
  apiUrl: string,
  accessToken: string,
): Promise<{ count: number; credentials: { id: number; name: string; created_at: string }[] }> {
  const res = await fetch(`${apiUrl}/api/auth/passkey/credentials/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { count: 0, credentials: [] };
  }
  return res.json() as Promise<{ count: number; credentials: { id: number; name: string; created_at: string }[] }>;
}

export async function deletePasskeyCredential(
  apiUrl: string,
  accessToken: string,
  credentialId: number,
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/auth/passkey/credentials/${credentialId}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

