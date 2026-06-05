export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
  job_title: string;
  years_of_experience: number | null;
  preferred_stack: string[];
}

const USER_PROFILE_KEY = 'ef_user';

export function storeUser(profile: UserProfile): void {
  const raw = (profile.first_name?.trim() || profile.email) ?? '';
  const displayName = raw.substring(0, 10);
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify({ displayName }));
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName } }));
}

export function clearUser(): void {
  localStorage.removeItem(USER_PROFILE_KEY);
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName: null } }));
}

export function getStoredUser(): { displayName: string } | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { displayName: string }) : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('API request failed');
  }
}

export class LoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Login failed');
  }
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new LoginError(res.status, data);
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function signUp(payload: {
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
}): Promise<void> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const res = await fetch(`/api/auth/verify-email/${token}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch('/api/auth/password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile');
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function updateProfile(payload: {
  first_name?: string;
  last_name?: string;
}): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function saveOnboarding(payload: {
  job_title: string;
  years_of_experience: number | null;
  preferred_stack: string[];
}): Promise<UserProfile> {
  const res = await fetch('/api/auth/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
): Promise<{ profile_picture: string | null }> {
  const res = await fetch('/api/auth/profile/picture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export interface ResumeImportResult {
  bullets_imported: number;
  skills_imported: number;
}

export async function uploadResume(file: File): Promise<ResumeImportResult> {
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch('/api/auth/resume', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<ResumeImportResult>;
}

export async function deletePasskeyCredential(id: number): Promise<void> {
  const res = await fetch(`/api/auth/passkey/credentials/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new ApiError(res.status, {});
  }
}

export async function getPasskeyCredentials(): Promise<{
  count: number;
  credentials: { id: number; name: string; created_at: string }[];
}> {
  const res = await fetch('/api/auth/passkey/credentials');
  if (!res.ok) return { count: 0, credentials: [] };
  return res.json() as Promise<{
    count: number;
    credentials: { id: number; name: string; created_at: string }[];
  }>;
}

export async function registerPasskey(
  name = 'My passkey',
): Promise<{ id: number; name: string }> {
  const { startRegistration } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
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

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, challenge_id, name }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new ApiError(verifyRes.status, data);
  }

  return verifyRes.json() as Promise<{ id: number; name: string }>;
}

export async function loginWithPasskey(email: string): Promise<void> {
  const { startAuthentication } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch('/api/auth/passkey/authenticate/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
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

  const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, credential, challenge_id }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new LoginError(verifyRes.status, data);
  }
}
