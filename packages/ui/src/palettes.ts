// --- Types ---

type CSSVariableKey =
  | '--background'
  | '--foreground'
  | '--surface-1'
  | '--surface-2'
  | '--border'
  | '--accent'
  | '--accent-foreground';

type PaletteVariables = Record<CSSVariableKey, string>;

interface PaletteDefinition {
  name: string;
  label: string;
  light: PaletteVariables;
  dark: PaletteVariables;
}

// --- Palette Definitions ---

const palettes: Record<string, PaletteDefinition> = {
  cyan: {
    name: 'cyan',
    label: 'Cyan',
    light: {
      '--background': '#ffffff',
      '--foreground': '#171717',
      '--surface-1': '#f5f5f5',
      '--surface-2': '#e5e5e5',
      '--border': '#e5e7eb',
      '--accent': '#06b6d4',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#202020',
      '--foreground': '#ededed',
      '--surface-1': '#1e1e1e',
      '--surface-2': '#2f2f2f',
      '--border': '#333333',
      '--accent': '#22d3ee',
      '--accent-foreground': '#0a0a0a',
    },
  },

  ocean: {
    name: 'ocean',
    label: 'Ocean',
    light: {
      '--background': '#f8fafc',
      '--foreground': '#0f172a',
      '--surface-1': '#e0f2fe',
      '--surface-2': '#bae6fd',
      '--border': '#93c5fd',
      '--accent': '#2563eb',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#020617',
      '--foreground': '#e2e8f0',
      '--surface-1': '#0f172a',
      '--surface-2': '#1e293b',
      '--border': '#1e3a5f',
      '--accent': '#60a5fa',
      '--accent-foreground': '#020617',
    },
  },

  rose: {
    name: 'rose',
    label: 'Rose',
    light: {
      '--background': '#fff7f7',
      '--foreground': '#1c1017',
      '--surface-1': '#ffe4e6',
      '--surface-2': '#fecdd3',
      '--border': '#fda4af',
      '--accent': '#e11d48',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#0c0608',
      '--foreground': '#f2e0e6',
      '--surface-1': '#1c0f14',
      '--surface-2': '#2d1520',
      '--border': '#4c1d2e',
      '--accent': '#fb7185',
      '--accent-foreground': '#0c0608',
    },
  },

  emerald: {
    name: 'emerald',
    label: 'Emerald',
    light: {
      '--background': '#f7fdf9',
      '--foreground': '#0c1f13',
      '--surface-1': '#d1fae5',
      '--surface-2': '#a7f3d0',
      '--border': '#6ee7b7',
      '--accent': '#059669',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#030c06',
      '--foreground': '#d6f5e2',
      '--surface-1': '#0c1f13',
      '--surface-2': '#14332a',
      '--border': '#1a4a38',
      '--accent': '#34d399',
      '--accent-foreground': '#030c06',
    },
  },

  amber: {
    name: 'amber',
    label: 'Amber',
    light: {
      '--background': '#fffdf5',
      '--foreground': '#1c1508',
      '--surface-1': '#fef3c7',
      '--surface-2': '#fde68a',
      '--border': '#fcd34d',
      '--accent': '#d97706',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#0c0a02',
      '--foreground': '#f5edd6',
      '--surface-1': '#1c1508',
      '--surface-2': '#2d2510',
      '--border': '#4a3b14',
      '--accent': '#fbbf24',
      '--accent-foreground': '#0c0a02',
    },
  },

  violet: {
    name: 'violet',
    label: 'Violet',
    light: {
      '--background': '#faf5ff',
      '--foreground': '#1a0e2e',
      '--surface-1': '#ede9fe',
      '--surface-2': '#ddd6fe',
      '--border': '#c4b5fd',
      '--accent': '#7c3aed',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#07020e',
      '--foreground': '#e8dff5',
      '--surface-1': '#1a0e2e',
      '--surface-2': '#271848',
      '--border': '#3b1f6e',
      '--accent': '#a78bfa',
      '--accent-foreground': '#07020e',
    },
  },

  slate: {
    name: 'slate',
    label: 'Slate',
    light: {
      '--background': '#f8fafc',
      '--foreground': '#0f172a',
      '--surface-1': '#f1f5f9',
      '--surface-2': '#e2e8f0',
      '--border': '#cbd5e1',
      '--accent': '#475569',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#020409',
      '--foreground': '#e2e8f0',
      '--surface-1': '#0f172a',
      '--surface-2': '#1e293b',
      '--border': '#334155',
      '--accent': '#94a3b8',
      '--accent-foreground': '#020409',
    },
  },

  coral: {
    name: 'coral',
    label: 'Coral',
    light: {
      '--background': '#fffaf5',
      '--foreground': '#1c1008',
      '--surface-1': '#ffedd5',
      '--surface-2': '#fed7aa',
      '--border': '#fdba74',
      '--accent': '#ea580c',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#0c0602',
      '--foreground': '#f5e6d6',
      '--surface-1': '#1c1208',
      '--surface-2': '#2d1e10',
      '--border': '#4a3018',
      '--accent': '#fb923c',
      '--accent-foreground': '#0c0602',
    },
  },

  teal: {
    name: 'teal',
    label: 'Teal',
    light: {
      '--background': '#f5fdfc',
      '--foreground': '#0c1f1d',
      '--surface-1': '#ccfbf1',
      '--surface-2': '#99f6e4',
      '--border': '#5eead4',
      '--accent': '#0d9488',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#030c0b',
      '--foreground': '#d6f5f0',
      '--surface-1': '#0c1f1d',
      '--surface-2': '#143330',
      '--border': '#1a4a44',
      '--accent': '#2dd4bf',
      '--accent-foreground': '#030c0b',
    },
  },

  fuchsia: {
    name: 'fuchsia',
    label: 'Fuchsia',
    light: {
      '--background': '#fdf5fd',
      '--foreground': '#1e0a1e',
      '--surface-1': '#fae8ff',
      '--surface-2': '#f0abfc',
      '--border': '#e879f9',
      '--accent': '#c026d3',
      '--accent-foreground': '#ffffff',
    },
    dark: {
      '--background': '#0a020a',
      '--foreground': '#f0dff0',
      '--surface-1': '#1e0a1e',
      '--surface-2': '#301530',
      '--border': '#4a1d4a',
      '--accent': '#e879f9',
      '--accent-foreground': '#0a020a',
    },
  },
};

// --- Constants ---

const DEFAULT_PALETTE = 'cyan';
const paletteNames: string[] = Object.keys(palettes);

// --- Exports ---

export { palettes, DEFAULT_PALETTE, paletteNames };
export type { CSSVariableKey, PaletteVariables, PaletteDefinition };
