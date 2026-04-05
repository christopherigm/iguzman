'use client';

import { useEffect } from 'react';
import { scheduleTokenRefresh } from './auth';

/**
 * Bootstrap the auto-refresh scheduler on mount.
 * Place this in the root layout or auth provider so it runs once per page load.
 * Handles the case where the user returns after the access token has expired —
 * scheduleTokenRefresh fires immediately when the token is already past the buffer window.
 */
export function useTokenRefresh(apiUrl = ''): void {
  useEffect(() => {
    scheduleTokenRefresh(apiUrl);
  }, [apiUrl]);
}
