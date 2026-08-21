"use client";

import { createContext, use, useMemo, useEffect } from "react";
import { useTheme } from "./theme-provider";
import { palettes, DEFAULT_PALETTE } from "./palettes";
import type { PaletteDefinition } from "./palettes";
import { accentInkVariables } from "./core-elements/contrast";

// --- Types ---

type PaletteName = string;

interface PaletteContextValue {
  name: PaletteName;
  definition: PaletteDefinition;
}

interface PaletteProviderProps {
  children: React.ReactNode;
  palette: PaletteName;
  /**
   * One brand hex, applied as `--accent` in **both** themes - which is what a
   * customer's brand colour is, and why `--accent-text` below exists.
   */
  accent?: string;
  /**
   * An extra background this app paints in each theme that the palette doesn't
   * name - a tenant-configured page background, typically. It joins the
   * palette's own surfaces when `--accent-text` is derived, so the ink clears
   * every background the app can actually put it on.
   *
   * Two flat strings rather than one object: they are `useMemo` dependencies,
   * and an inline object literal would be a new reference on every render.
   */
  inkSurfaceLight?: string;
  inkSurfaceDark?: string;
  className?: string;
  style?: React.CSSProperties;
}

// --- Context ---

const PaletteContext = createContext<PaletteContextValue | null>(null);

// --- PaletteProvider ---

function PaletteProvider({
  children,
  palette,
  accent,
  inkSurfaceLight,
  inkSurfaceDark,
  className,
  style: styleProp,
}: PaletteProviderProps) {
  const { state } = useTheme();
  const resolved = state.resolved;

  if (process.env.NODE_ENV !== "production" && !palettes[palette]) {
    console.warn(
      `[PaletteProvider] Unknown palette "${palette}", falling back to "${DEFAULT_PALETTE}"`,
    );
  }

  const definition = palettes[palette] ?? palettes[DEFAULT_PALETTE]!;
  const variables = definition[resolved];

  const style = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      vars[key] = value;
    }
    if (accent) {
      vars["--accent"] = accent;
    }
    // `--accent` is one hex in both themes, so text painted in it is legible in
    // only one of them - a brand navy vanishes into a dark surface, a brand
    // yellow into a light one. `--accent-text` is the same colour with its
    // lightness walked until it clears WCAG AA against this theme's surfaces;
    // every core element that paints the accent as *ink* reads it (with
    // `var(--accent)` as the fallback, so nothing changes where it is unset).
    //
    // ⚠ Fills keep `--accent` untouched: a primary button, a filled badge, a
    // slider track and a border are the brand colour itself, and their own
    // foreground answers for the contrast there.
    //
    // Both variants are published beside the resolved one so an app whose CSS
    // resolves `--accent-text` per `[data-theme]` (for the server-rendered first
    // paint, before this effect runs) agrees with what lands here.
    const ink = accentInkVariables(accent, definition, {
      light: [inkSurfaceLight],
      dark: [inkSurfaceDark],
    });
    Object.assign(vars, ink);
    const resolvedInk =
      resolved === "dark"
        ? ink["--accent-text-dark"]
        : ink["--accent-text-light"];
    if (resolvedInk) vars["--accent-text"] = resolvedInk;
    return { ...vars, ...styleProp };
  }, [
    variables,
    styleProp,
    accent,
    definition,
    inkSurfaceLight,
    inkSurfaceDark,
    resolved,
  ]);

  useEffect(() => {
    for (const [key, value] of Object.entries(style)) {
      document.body.style.setProperty(key, String(value));
    }
    if (className) {
      document.body.classList.add(...className.split(" ").filter(Boolean));
    }
  }, [style, className]);

  const contextValue = useMemo<PaletteContextValue>(
    () => ({ name: definition.name, definition }),
    [definition],
  );

  return <PaletteContext value={contextValue}>{children}</PaletteContext>;
}

// --- usePalette Hook ---

function usePalette(): PaletteContextValue {
  const context = use(PaletteContext);
  if (context === null) {
    return { name: DEFAULT_PALETTE, definition: palettes[DEFAULT_PALETTE]! };
  }
  return context;
}

// --- Exports ---

export { PaletteProvider, usePalette };
export type { PaletteName, PaletteContextValue, PaletteProviderProps };
