'use client';

import { useTheme } from './theme-provider';
import type { ThemeMode } from './theme-provider';

const modes: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeSwitch() {
  const { state, actions } = useTheme();

  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: '1px solid var(--border, #e5e7eb)',
        background: 'var(--surface-1, #f5f5f5)',
        padding: 3,
        gap: 2,
      }}
    >
      {modes.map(({ value, label }) => {
        const active = state.mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => actions.setMode(value)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent, #06b6d4)' : 'transparent',
              color: active
                ? 'var(--accent-foreground, #fff)'
                : 'var(--foreground, #171717)',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
