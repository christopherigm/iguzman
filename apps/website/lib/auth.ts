/**
 * Auth for website. The shared surface (login, signup, passkeys, password reset)
 * lives in `@repo/auth/client`; only the app-specific calls are defined here.
 *
 * Note there is no client-side user store any more. `isAdmin` and `systemId` are
 * claims on the access token, read on the server via `getSession()` and handed to
 * client components through `useSession()` - so admin nav renders correctly in the
 * first HTML instead of appearing after hydration. They still only drive
 * presentation: Django re-derives both from the token on every call.
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
  type PasskeyCredential,
} from "@repo/auth/client";

import {
  getProfile as getSharedProfile,
  updateProfile as updateSharedProfile,
  type UserProfile as BaseUserProfile,
} from "@repo/auth/client";

/** The shared profile plus website's tenancy claims. */
export interface UserProfile extends BaseUserProfile {
  is_admin: boolean;
  system_id: number;
}

/**
 * The full profile, including fields too volatile to carry in a JWT (the avatar).
 * The navbar does not need this - it renders from the session.
 */
export function getProfile(): Promise<UserProfile> {
  return getSharedProfile<UserProfile>();
}

export function updateProfile(payload: {
  first_name?: string;
  last_name?: string;
}): Promise<UserProfile> {
  return updateSharedProfile<UserProfile>(payload);
}
