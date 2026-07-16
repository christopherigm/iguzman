import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  DEFAULT_PALETTE,
  resolveTheme,
  type PaletteName,
  type Theme,
} from "./theme";

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Accent palette to apply. @default 'cyan' */
  palette?: PaletteName;
  /**
   * Force a color scheme instead of following the OS. Omit to track the
   * device's light/dark setting via `useColorScheme`.
   */
  scheme?: "light" | "dark";
  children: ReactNode;
}

/**
 * Provides the resolved `Theme` to every `@repo/ui-native` component below it.
 * Wrap your app root once (e.g. in the Expo Router root `_layout`).
 */
export function ThemeProvider({
  palette = DEFAULT_PALETTE,
  scheme,
  children,
}: ThemeProviderProps) {
  const osScheme = useColorScheme();
  const active = scheme ?? (osScheme === "dark" ? "dark" : "light");
  const theme = useMemo(() => resolveTheme(palette, active), [palette, active]);
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/**
 * Read the active theme. Falls back to the default palette (light) when no
 * `ThemeProvider` is mounted, so components never crash in isolation.
 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  return ctx ?? resolveTheme(DEFAULT_PALETTE, "light");
}
