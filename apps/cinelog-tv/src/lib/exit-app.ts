/**
 * Close the app. On a real TV this is the Tizen Application API's `exit()`
 * (no privilege needed to exit the current app); in browser dev there is no
 * equivalent, so fall back to `window.close()` (a no-op on tabs the script
 * didn't open, which is fine for dev).
 */
export function exitApp(): void {
  const tizen = window.tizen;
  if (tizen) {
    tizen.application.getCurrentApplication().exit();
    return;
  }
  window.close();
}
