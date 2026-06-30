// Shared runtime endpoints for the TV app. Vite exposes only VITE_-prefixed
// vars to the client bundle; both fall back to the production hosts so a packaged
// .wgt works without build-time config.

/** Django catalog/auth API base. */
export const API_URL =
  import.meta.env.VITE_API_URL ?? "https://cinelog-api.iguzman.com.mx";

/** Cinelog web app base - shown on the pairing screen as where to enter the code. */
export const WEB_URL =
  import.meta.env.VITE_WEB_URL ?? "https://cinelog.iguzman.com.mx";
