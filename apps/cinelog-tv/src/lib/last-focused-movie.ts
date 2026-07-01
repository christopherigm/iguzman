// Remembers the last movie card the user opened, so returning from the movie
// detail can restore D-pad focus onto that card instead of snapping back to the
// first one.
//
// Unlike the AI-search snapshot (localStorage, so it survives a relaunch), this
// is a plain module-level value: it only needs to bridge the in-session
// `/` -> `/movie/:slug` -> back round-trip (React Router keeps the module loaded).
// A full app relaunch legitimately resets focus to the top of the grid, which is
// exactly what a fresh module instance gives us.

let lastFocusedMovieId: number | null = null;

/** Record the card the user is opening so the return trip can re-focus it. */
export function saveLastFocusedMovie(id: number): void {
  lastFocusedMovieId = id;
}

/** The id of the last-opened card, or null when none has been opened yet. */
export function readLastFocusedMovie(): number | null {
  return lastFocusedMovieId;
}
