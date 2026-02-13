'use client';

import { useState, CSSProperties } from 'react';
import { UIComponentProps, createSafeStyle } from './utils';

interface SwitchProps extends UIComponentProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  id?: string;
}

export const Switch = ({
  checked,
  defaultChecked = false,
  onChange,
  className,
  id,
  ...props
}: SwitchProps) => {
  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const value = isControlled ? checked : internalChecked;

  const safeStyle: CSSProperties = createSafeStyle(props);

  const toggle = () => {
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

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={value}
      onClick={toggle}
      onKeyDown={handleKey}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        width: 42,
        height: 26,
        padding: 3,
        borderRadius: 9999,
        background: value
          ? 'var(--accent, #06b6d4)'
          : 'var(--surface-2, #e5e7eb)',
        border: 'none',
        cursor: 'pointer',
        ...safeStyle,
      }}
    >
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
    </button>
  );
};
