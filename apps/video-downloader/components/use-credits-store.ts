'use client';

import { useSyncExternalStore } from 'react';

/* ── Simple reactive store for the credits balance ──── */

let creditsBalance = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return creditsBalance;
}

/** Update the global credits balance (called from CreditsInitializer and after API calls). */
export function setCreditsBalance(balance: number) {
  creditsBalance = balance;
  listeners.forEach((l) => l());
}

/** Read the current credits balance reactively (triggers re-render on change). */
export function useCreditsBalance(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
