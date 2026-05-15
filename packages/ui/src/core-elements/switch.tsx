'use client';

import { useState, CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';

interface SwitchProps extends UIComponentProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export const Switch = ({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  className,
  id,
  ...props
}: SwitchProps) => {
  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const value = isControlled ? checked : internalChecked;

  const safeStyle: CSSProperties = buildStyleProps(props);

  const toggle = () => {
    if (disabled) return;
    const next = !value;
    if (!isControlled) setInternalChecked(next);
    onChange?.(next);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  const sharedProps = {
    id,
    type: 'button' as const,
    'aria-label': props['aria-label'] ?? 'Toggle',
    onClick: toggle,
    onKeyDown: handleKey,
    className,
    style: {
      display: 'inline-flex' as const,
      alignItems: 'center' as const,
      width: 42,
      height: 26,
      padding: 3,
      borderRadius: 9999,
      background: value
        ? 'var(--accent, #06b6d4)'
        : 'var(--surface-2, #e5e7eb)',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...safeStyle,
    },
  };

  const thumb = (
    <span
      aria-hidden
      style={{
        display: 'block',
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'var(--accent-foreground, white)',
        transform: value ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 150ms ease-in-out',
      }}
    />
  );

  return value ? (
    <button role="switch" {...sharedProps} aria-checked="true" disabled={disabled}>
      {thumb}
    </button>
  ) : (
    <button role="switch" {...sharedProps} aria-checked="false" disabled={disabled}>
      {thumb}
    </button>
  );
};
