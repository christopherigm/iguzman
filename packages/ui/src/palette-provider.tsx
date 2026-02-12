'use client';

import { createContext, use, useMemo } from 'react';
import { useTheme } from './theme-provider';
import { palettes, DEFAULT_PALETTE } from './palettes';
import type { PaletteDefinition } from './palettes';

// --- Types ---

type PaletteName = string;

interface PaletteContextValue {
  name: PaletteName;
  definition: PaletteDefinition;
}

interface PaletteProviderProps {
  children: React.ReactNode;
  palette: PaletteName;
  accent?: string;
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
  className,
  style: styleProp,
}: PaletteProviderProps) {
  const { state } = useTheme();
  const resolved = state.resolved;

  if (process.env.NODE_ENV !== 'production' && !palettes[palette]) {
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
      vars['--accent'] = accent;
    }
    return { ...vars, ...styleProp };
  }, [variables, styleProp, accent]);

  const contextValue = useMemo<PaletteContextValue>(
    () => ({ name: definition.name, definition }),
    [definition],
  );

  return (
    <PaletteContext value={contextValue}>
      <div style={style} className={className}>
        {children}
      </div>
    </PaletteContext>
  );
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
