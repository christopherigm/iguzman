/**
 * Auth for this app. The whole surface (login, signup, passkeys, password reset,
 * the profile calls) lives in `@repo/auth/client`; this module only re-exports it
 * so app code keeps importing from `@/lib/auth`.
 *
 * There is no client-side user store. Identity comes from the server via
 * `getSession()` / `useSession()`, decoded from the access-token cookie - so the
 * first render already knows who you are. Never reintroduce a localStorage user
 * or an `app-auth` event: the server cannot read them, which is what used to make
 * every page render logged-out until hydration corrected it.
 *
 * If this app's profile carries extra fields, declare
 * `interface UserProfile extends BaseUserProfile` and bind the generic:
 *
 *   import { getProfile as getSharedProfile } from '@repo/auth/client';
 *   export function getProfile(): Promise<UserProfile> {
 *     return getSharedProfile<UserProfile>();
 *   }
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
} from '@repo/auth/client';
