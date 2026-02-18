'use client';

import { useSyncExternalStore } from 'react';

/* ── Simple reactive store for the search query ─────── */

let searchQuery = '';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return searchQuery;
}

/** Update the global search query (called from the Navbar wrapper). */
export function setSearchQuery(query: string) {
  searchQuery = query;
  listeners.forEach((l) => l());
}

/** Read the current search query reactively (triggers re-render on change). */
export function useSearchQuery(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
