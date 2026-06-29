/** Samsung TV remote key codes (KeyboardEvent.keyCode). */
export const TV_KEYS = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 10009,
  MEDIA_PLAY_PAUSE: 10252,
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
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}
