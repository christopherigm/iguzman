import { init } from '@noriginmedia/norigin-spatial-navigation';

let started = false;

/**
 * Initialise Norigin spatial navigation once for the whole app. Call from the
 * entry point before the first render. Safe to call more than once.
 *
 * Tizen TV remotes emit standard arrow + enter keycodes, which Norigin maps by
 * default. Back (10009) is handled per-screen via `@repo/ui-tv/remote-keys`.
 */
export function initSpatialNav(): void {
  if (started) return;
  started = true;
  init({ debug: false, visualDebug: false });
}
