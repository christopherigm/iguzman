'use client';

import { useTheme } from './theme-provider';
import type { ThemeMode } from './theme-provider';
import Button from './core-elements/button';

const modes: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
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
          <Button
            key={value}
            type="button"
            text={label}
            onClick={() => actions.setMode(value)}
            color={
              active
                ? 'var(--accent-foreground, #fff)'
                : 'var(--foreground, #171717)'
            }
            styles={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent, #06b6d4)' : 'transparent',
            }}
          />
        );
      })}
    </div>
  );
}
