/**
 * Auth for cinelog. The shared surface (login, signup, passkeys, password reset,
 * the profile calls) lives in `@repo/auth/client`; only the app-specific calls
 * are defined here.
 *
 * Note there is no client-side user store any more. Identity comes from the
 * server via `getSession()` / `useSession()`, decoded from the access-token
 * cookie - so the first render already knows who you are.
 */
export {
  ApiError,
  LoginError,
  login,
  logout,
  signUp,
  verifyEmail,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  uploadProfilePicture,
  getPasskeyCredentials,
  deletePasskeyCredential,
  registerPasskey,
  loginWithPasskey,
  getProfile,
  updateProfile,
  type PasskeyCredential,
  type UserProfile,
} from "@repo/auth/client";

import { ApiError } from "@repo/auth/client";

/** Pair a Smart TV by entering the code it displays. */
export async function linkTv(userCode: string): Promise<void> {
  const res = await fetch("/api/auth/tv/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_code: userCode }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}
