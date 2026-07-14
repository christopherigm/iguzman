/**
 * Auth for tanda. The whole surface (login, signup, passkeys, password reset,
 * the profile calls) lives in `@repo/auth/client`; this module only re-exports
 * it so app code keeps importing from `@/lib/auth`.
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
