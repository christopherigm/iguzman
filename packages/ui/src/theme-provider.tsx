'use client';

import { createContext, use, useState, useEffect, useCallback } from 'react';

// --- Types ---

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

interface ThemeActions {
  setMode: (mode: ThemeMode) => void;
}

interface ThemeContextValue {
  state: ThemeState;
  actions: ThemeActions;
}

// --- Constants ---

const COOKIE_NAME = 'theme-mode';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 months

// --- Context ---

const ThemeContext = createContext<ThemeContextValue | null>(null);

// --- Helpers ---

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function setThemeCookie(mode: ThemeMode): void {
  document.cookie = `${COOKIE_NAME}=${mode};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

function applyThemeToDOM(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

// --- ThemeProvider ---

interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  initialResolved?: ResolvedTheme;
}

function ThemeProvider({
  children,
  initialMode = 'system',
  initialResolved = 'light',
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(
    initialMode === 'system' ? initialResolved : (initialMode as ResolvedTheme),
  );

  useEffect(() => {
    if (mode !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(next);
      applyThemeToDOM(next);
    };

    const current = getSystemTheme();
    setResolved(current);
    applyThemeToDOM(current);

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  useEffect(() => {
    if (mode === 'system') return;
    applyThemeToDOM(resolved);
  }, [mode, resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    const nextResolved = resolveTheme(next);
    setResolved(nextResolved);
    applyThemeToDOM(nextResolved);
    setThemeCookie(next);
  }, []);

  const value: ThemeContextValue = {
    state: { mode, resolved },
    actions: { setMode },
  };

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

// --- useTheme Hook ---

function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// --- ThemeScript (inline fallback for zero-flash SSR) ---

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var m=document.cookie.match(/(^|;)\\s*${COOKIE_NAME}=([^;]+)/);var mode=m?m[2]:'system';var resolved=mode;if(mode==='system'){resolved=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',resolved);document.documentElement.style.colorScheme=resolved}catch(e){}})()`,
      }}
    />
  );
}

// --- Exports ---

export { ThemeProvider, useTheme, ThemeScript, COOKIE_NAME };
export type {
  ThemeMode,
  ResolvedTheme,
  ThemeState,
  ThemeActions,
  ThemeContextValue,
};
