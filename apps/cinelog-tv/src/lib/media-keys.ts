/**
 * Register the remote's media-transport keys so Tizen delivers them to the app.
 *
 * Unlike the arrow/Enter/Back keys (always delivered), Play/Pause key codes are
 * withheld until an app explicitly registers them via `tizen.tvinputdevice`;
 * without this the play/pause button on the remote is simply never seen, so the
 * player's key handler for it can't fire. Safe to call once at startup.
 *
 * No-op off-device (dev browser / emulator), where `tizen` is undefined, and per
 * key, so a device that doesn't support a given name doesn't abort the rest.
 */
export function registerMediaKeys(): void {
  const tvinputdevice = window.tizen?.tvinputdevice;
  if (!tvinputdevice) return;
  // Cover both the single toggle button and remotes with discrete Play/Pause.
  for (const name of ["MediaPlayPause", "MediaPlay", "MediaPause"]) {
    try {
      tvinputdevice.registerKey(name);
    } catch (error) {
      // Most likely a missing `http://tizen.org/privilege/tv.inputdevice` in
      // config.xml (registerKey then throws SecurityError and the platform keeps
      // handling the key itself - drawing its own media OSD), or a key name this
      // device doesn't support. Log rather than swallow so it's diagnosable.
      console.warn(`registerKey("${name}") failed:`, error);
    }
  }
}
