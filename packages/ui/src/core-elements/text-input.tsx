'use client';

import { useState, useRef, CSSProperties, InputHTMLAttributes } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import './text-input.css';

/**
 * Native HTML input attributes we forward, minus the keys that overlap with
 * `UIComponentProps` or are overridden by `TextInputProps`.
 */
type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>,
  | 'value'
  | 'onChange'
  | 'type'
  | 'placeholder'
  | 'rows'
  | 'children'
  | 'color'
  | 'className'
  | 'id'
  | 'height'
  | 'width'
>;

/**
 * Props for the `TextInput` component.
 */
export interface TextInputProps extends UIComponentProps, NativeInputProps {
  /** Current value (controlled). */
  value?: string;
  /** Fires with the new string value on every keystroke. */
  onChange?: (value: string) => void;
  /** Floating label text. Acts as placeholder when idle. */
  lable?: string;
  /** HTML input type. Defaults to `"text"`. Ignored when `multirow` is true. */
  type?: string;
  /** Render a `<textarea>` instead of an `<input>`. */
  multirow?: boolean;
  /** Number of visible text rows when `multirow` is enabled. Defaults to `3`. */
  rows?: number;
  /** Standard placeholder. When omitted the `lable` fills this role. */
  placeholder?: string;
  /** React 19 ref — no forwardRef needed. */
  ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}

/**
 * TextInput — Material Design floating-label text field.
 *
 * Supports both `<input>` and `<textarea>` (via `multirow`), controlled and
 * uncontrolled usage, and extends `UIComponentProps` for layout integration.
 *
 * @example
 * ```tsx
 * <TextInput lable="My input" value={text} onChange={(v) => setText(v)} />
 * ```
 *
 * @example
 * ```tsx
 * <TextInput lable="Bio" multirow rows={5} />
 * ```
 */
export const TextInput = ({
  value,
  onChange,
  lable,
  type = 'text',
  multirow = false,
  rows = 3,
  placeholder,
  className,
  id,
  ref,
  ...rest
}: TextInputProps) => {
  // ── Controlled / uncontrolled ──────────────────────────────────
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState('');
  const currentValue = isControlled ? value : internalValue;

  // Track focus independently so the label stays floated while typing.
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Label floats when focused OR when the field has content.
  const isActive = isFocused || (currentValue ?? '').length > 0;

  // ── Layout style from UIComponentProps ────────────────────────
  const uiProps = rest as UIComponentProps;
  const safeStyle: CSSProperties = buildStyleProps(uiProps);

  // ── Handlers ──────────────────────────────────────────────────
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  const handleFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setIsFocused(true);
    (rest as NativeInputProps).onFocus?.(
      e as React.FocusEvent<HTMLInputElement>,
    );
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setIsFocused(false);
    (rest as NativeInputProps).onBlur?.(
      e as React.FocusEvent<HTMLInputElement>,
    );
  };

  // Resolve the ref to assign: merge the external ref with internal one.
  const assignRef = (node: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref && typeof ref === 'object') {
      (
        ref as React.MutableRefObject<
          HTMLInputElement | HTMLTextAreaElement | null
        >
      ).current = node;
    }
  };

  // ── Shared props for <input> / <textarea> ─────────────────────
  const sharedProps = {
    id,
    ref: assignRef,
    value: currentValue ?? '',
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    // If a placeholder is explicitly provided, use it. Otherwise the lable
    // visually replaces the placeholder via CSS, so we keep it empty.
    placeholder: placeholder ?? (isFocused && lable ? lable : undefined),
    'aria-label': lable ?? undefined,
  };

  // ── Wrapper class name ────────────────────────────────────────
  const wrapperCls = [
    'ui-text-input-wrapper',
    isActive ? 'ui-text-input-wrapper--active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={wrapperCls} style={safeStyle}>
      {multirow ? (
        <textarea
          {...(sharedProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          className="ui-text-input-multirow"
          rows={rows}
        />
      ) : (
        <input
          {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)}
          className="ui-text-input"
          type={type}
        />
      )}

      {lable && (
        <label htmlFor={id} className="ui-text-input-label">
          {lable}
        </label>
      )}

      {/* Material active-indicator bar */}
      <span aria-hidden className="ui-text-input-bar" />
    </div>
  );
};

export default TextInput;
