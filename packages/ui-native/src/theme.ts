/**
 * Theme tokens for `@repo/ui-native`.
 *
 * These mirror the semantic token names used by `@repo/ui`'s web palette
 * system (`--background`, `--surface-1`, `--accent`, …) so a design reads the
 * same across the web and native apps - but here they are plain hex strings in
 * a flat object, since React Native has no CSS custom properties. Each palette
 * ships a `light` and `dark` variant; `ThemeProvider` picks one from the OS
 * color scheme.
 */

/** Semantic color slots. One entry per role the components consume. */
export interface ThemeColors {
  background: string;
  foreground: string;
  surface1: string;
  surface2: string;
  border: string;
  accent: string;
  accentForeground: string;
  error: string;
  errorForeground: string;
  warning: string;
  warningForeground: string;
  success: string;
  successForeground: string;
  /** Muted/secondary text color derived from `foreground`. */
  muted: string;
}

export interface PaletteDefinition {
  name: PaletteName;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export type PaletteName =
  | 'cyan'
  | 'ocean'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose';

/**
 * Spacing scale (in density-independent pixels). Prefer these over raw numbers
 * when setting `padding`/`margin`/`gap` so spacing stays consistent.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Corner-radius scale in dp. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** Type scale: font size + line height per typographic variant. */
export const typeScale = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  subtitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
} as const;

export type TypeVariant = keyof typeof typeScale;

export const palettes: Record<PaletteName, PaletteDefinition> = {
  cyan: {
    name: 'cyan',
    label: 'Cyan',
    light: {
      background: '#fafafa',
      foreground: '#171717',
      surface1: '#f5f5f5',
      surface2: '#e5e5e5',
      border: '#e5e7eb',
      accent: '#06b6d4',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#e98410',
      warningForeground: '#ffffff',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#6b7280',
    },
    dark: {
      background: '#202020',
      foreground: '#ededed',
      surface1: '#333333',
      surface2: '#3c3c3c',
      border: '#444444',
      accent: '#22d3ee',
      accentForeground: '#0a0a0a',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#fbbf24',
      warningForeground: '#0c0800',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#9ca3af',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    light: {
      background: '#f8fafc',
      foreground: '#0f172a',
      surface1: '#e0f2fe',
      surface2: '#bae6fd',
      border: '#93c5fd',
      accent: '#2563eb',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#d97706',
      warningForeground: '#1c1000',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#64748b',
    },
    dark: {
      background: '#020617',
      foreground: '#e2e8f0',
      surface1: '#0f172a',
      surface2: '#1e293b',
      border: '#1e3a5f',
      accent: '#60a5fa',
      accentForeground: '#020617',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#fbbf24',
      warningForeground: '#0c0800',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#94a3b8',
    },
  },
  violet: {
    name: 'violet',
    label: 'Violet',
    light: {
      background: '#faf9ff',
      foreground: '#1e1b2e',
      surface1: '#f3f0ff',
      surface2: '#e5deff',
      border: '#ddd6fe',
      accent: '#7c3aed',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#e98410',
      warningForeground: '#ffffff',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#6b7280',
    },
    dark: {
      background: '#17141f',
      foreground: '#ede9fe',
      surface1: '#241f31',
      surface2: '#2e2740',
      border: '#4c3f6b',
      accent: '#a78bfa',
      accentForeground: '#140a24',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#fbbf24',
      warningForeground: '#0c0800',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#a1a1aa',
    },
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald',
    light: {
      background: '#f8fbf9',
      foreground: '#0d1f17',
      surface1: '#ecfdf5',
      surface2: '#d1fae5',
      border: '#a7f3d0',
      accent: '#059669',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#e98410',
      warningForeground: '#ffffff',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#6b7280',
    },
    dark: {
      background: '#0a1712',
      foreground: '#d1fae5',
      surface1: '#12241c',
      surface2: '#1a3328',
      border: '#2f5a45',
      accent: '#34d399',
      accentForeground: '#052013',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#fbbf24',
      warningForeground: '#0c0800',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#94a3b8',
    },
  },
  amber: {
    name: 'amber',
    label: 'Amber',
    light: {
      background: '#fffdf7',
      foreground: '#1f1a0d',
      surface1: '#fffbeb',
      surface2: '#fef3c7',
      border: '#fde68a',
      accent: '#d97706',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#b45309',
      warningForeground: '#ffffff',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#78716c',
    },
    dark: {
      background: '#1a1509',
      foreground: '#fef3c7',
      surface1: '#26200f',
      surface2: '#332b16',
      border: '#5c4a1f',
      accent: '#fbbf24',
      accentForeground: '#1c1400',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#f59e0b',
      warningForeground: '#160f00',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#a8a29e',
    },
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    light: {
      background: '#fff7f9',
      foreground: '#26121a',
      surface1: '#fff1f2',
      surface2: '#ffe4e6',
      border: '#fecdd3',
      accent: '#e11d48',
      accentForeground: '#ffffff',
      error: '#d62a2a',
      errorForeground: '#ffffff',
      warning: '#e98410',
      warningForeground: '#ffffff',
      success: '#16a34a',
      successForeground: '#ffffff',
      muted: '#6b7280',
    },
    dark: {
      background: '#1c0f14',
      foreground: '#ffe4e6',
      surface1: '#2a151d',
      surface2: '#3a1c27',
      border: '#6b3145',
      accent: '#fb7185',
      accentForeground: '#25060d',
      error: '#f87171',
      errorForeground: '#1c0002',
      warning: '#fbbf24',
      warningForeground: '#0c0800',
      success: '#4ade80',
      successForeground: '#05140a',
      muted: '#a1a1aa',
    },
  },
};

export const DEFAULT_PALETTE: PaletteName = 'cyan';

/** Full theme object handed to components via `useTheme()`. */
export interface Theme {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
  palette: PaletteName;
  spacing: typeof spacing;
  radius: typeof radius;
  typeScale: typeof typeScale;
}

/** Resolve a concrete `Theme` from a palette name and OS color scheme. */
export function resolveTheme(
  palette: PaletteName,
  scheme: 'light' | 'dark',
): Theme {
  const def = palettes[palette] ?? palettes[DEFAULT_PALETTE];
  return {
    colors: scheme === 'dark' ? def.dark : def.light,
    scheme,
    palette: def.name,
    spacing,
    radius,
    typeScale,
  };
}
