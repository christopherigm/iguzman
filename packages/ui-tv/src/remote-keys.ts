/** Samsung TV remote key codes (KeyboardEvent.keyCode). */
export const TV_KEYS = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 10009,
  // Transport keys. Remotes vary: some send the single toggle (MEDIA_PLAY_PAUSE),
  // others discrete Play/Pause. All must be registered via `tvinputdevice`
  // before the platform delivers them (see the TV app's media-key registration).
  MEDIA_PLAY_PAUSE: 10252,
  MEDIA_PLAY: 415,
  MEDIA_PAUSE: 19,
} as const;

/**
 * Register a handler for the remote Back button. Returns an unsubscribe fn.
 *
 * @example
 * useEffect(() => onBackButton(() => navigate(-1)), []);
 */
export function onBackButton(handler: () => void): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.keyCode === TV_KEYS.BACK) handler();
  };
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}
