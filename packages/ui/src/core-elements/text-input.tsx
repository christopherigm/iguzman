"use client";

import { useState, useRef, CSSProperties, InputHTMLAttributes } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import "./text-input.css";

/**
 * Supported input masks. The mask is applied to the *displayed* value while the
 * user types; `onChange` always receives the raw, unformatted value.
 *
 * - `text`     - no formatting (default).
 * - `currency` - US: `$` prefix, comma thousands, dot decimal (raw: `1234.5`).
 * - `number`   - comma thousands, dot decimal, no symbol (raw: `1234.5`).
 * - `date`     - US `MM/DD/YYYY` mask (raw: `12252026`).
 * - `phone`    - US `(XXX) XXX-XXXX` mask (raw: `1234567890`).
 */
export type TextInputFormat = "text" | "currency" | "number" | "date" | "phone";

/** Mobile virtual-keyboard hint per format. */
const FORMAT_INPUT_MODE: Record<
  TextInputFormat,
  InputHTMLAttributes<HTMLInputElement>["inputMode"]
> = {
  text: undefined,
  currency: "decimal",
  number: "decimal",
  date: "numeric",
  phone: "numeric",
};

/** Strip whatever the user typed down to the raw, unformatted value. */
const toRawValue = (input: string, format: TextInputFormat): string => {
  switch (format) {
    case "currency":
    case "number": {
      // Keep digits and a single decimal point.
      let raw = input.replace(/[^\d.]/g, "");
      const firstDot = raw.indexOf(".");
      if (firstDot !== -1) {
        raw =
          raw.slice(0, firstDot + 1) +
          raw.slice(firstDot + 1).replace(/\./g, "");
      }
      return raw;
    }
    case "date":
      return input.replace(/\D/g, "").slice(0, 8);
    case "phone":
      return input.replace(/\D/g, "").slice(0, 10);
    default:
      return input;
  }
};

/** Produce the masked display string from the raw value. */
const toDisplayValue = (raw: string, format: TextInputFormat): string => {
  if (!raw) return "";
  switch (format) {
    case "currency":
    case "number": {
      const [intPart = "", ...rest] = raw.split(".");
      const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      let out = grouped;
      if (raw.includes(".")) out += "." + rest.join("");
      return format === "currency" ? "$" + out : out;
    }
    case "date": {
      let out = raw.slice(0, 2);
      if (raw.length > 2) out += "/" + raw.slice(2, 4);
      if (raw.length > 4) out += "/" + raw.slice(4, 8);
      return out;
    }
    case "phone": {
      if (raw.length < 3) return "(" + raw;
      let out = "(" + raw.slice(0, 3) + ") " + raw.slice(3, 6);
      if (raw.length > 6) out += "-" + raw.slice(6, 10);
      return out;
    }
    default:
      return raw;
  }
};

/**
 * Native HTML input attributes we forward, minus the keys that overlap with
 * `UIComponentProps` or are overridden by `TextInputProps`.
 */
type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>,
  | "value"
  | "onChange"
  | "type"
  | "placeholder"
  | "rows"
  | "children"
  | "color"
  | "className"
  | "id"
  | "height"
  | "width"
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
  label?: string;
  /**
   * Input mask applied to the displayed value while typing. Defaults to
   * `"text"` (no formatting). When set to anything else, `onChange` receives the
   * raw unformatted value (e.g. `"1234.5"`, `"12252026"`) while the field shows
   * the formatted version (e.g. `"$1,234.5"`, `"12/25/2026"`).
   */
  format?: TextInputFormat;
  /** HTML input type. Defaults to `"text"`. Ignored when `multirow` is true. */
  type?: string;
  /** Render a `<textarea>` instead of an `<input>`. */
  multirow?: boolean;
  /** Number of visible text rows when `multirow` is enabled. Defaults to `3`. */
  rows?: number;
  /** Standard placeholder. When omitted the `label` fills this role. */
  placeholder?: string;
  /** React 19 ref - no forwardRef needed. */
  ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}

/**
 * TextInput - Material Design floating-label text field.
 *
 * Supports both `<input>` and `<textarea>` (via `multirow`), controlled and
 * uncontrolled usage, and extends `UIComponentProps` for layout integration.
 *
 * @example
 * ```tsx
 * <TextInput label="My input" value={text} onChange={(v) => setText(v)} />
 * ```
 *
 * @example
 * ```tsx
 * <TextInput label="Bio" multirow rows={5} />
 * ```
 *
 * @example Masked input - `onChange` receives the raw value, the field shows the mask.
 * ```tsx
 * // amount === "1234.5", displayed as "$1,234.5"
 * <TextInput label="Amount" format="currency" value={amount} onChange={setAmount} />
 * ```
 */
export const TextInput = ({
  value,
  onChange,
  label,
  type = "text",
  format = "text",
  multirow = false,
  rows = 3,
  placeholder,
  className,
  id,
  ref,
  disabled,
  required,
  maxLength,
  onKeyDown,
  onPaste,
  min,
  max,
  step,
  "aria-label": ariaLabel,
  ...rest
}: TextInputProps) => {
  // ── Controlled / uncontrolled ──────────────────────────────────
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState("");
  // The stored value is always the raw, unformatted value.
  const currentValue = isControlled ? value : internalValue;

  // A mask always renders as a plain text field so we control the formatting;
  // the displayed value is masked, while the stored/emitted value stays raw.
  const isMasked = format !== "text";
  const effectiveType = isMasked ? "text" : type;
  const displayValue = isMasked
    ? toDisplayValue(currentValue ?? "", format)
    : (currentValue ?? "");

  // Track focus independently so the label stays floated while typing.
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Some input types always show browser-native UI (date picker, color swatch)
  // and must keep the label floated to avoid overlap with the native control.
  const alwaysActive = [
    "date",
    "time",
    "datetime-local",
    "week",
    "month",
    "color",
  ].includes(effectiveType);

  // Label floats when focused OR when the field has content OR type always shows UI.
  const isActive = alwaysActive || isFocused || (currentValue ?? "").length > 0;

  // ── Layout style from UIComponentProps ────────────────────────
  const uiProps = rest as UIComponentProps;
  const safeStyle: CSSProperties = buildStyleProps(uiProps);

  // ── Handlers ──────────────────────────────────────────────────
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = isMasked ? toRawValue(e.target.value, format) : e.target.value;
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
    if (typeof ref === "function") ref(node);
    else if (ref && typeof ref === "object") {
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
    value: displayValue,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    disabled,
    required,
    maxLength,
    onKeyDown,
    onPaste,
    min,
    max,
    step,
    inputMode: isMasked ? FORMAT_INPUT_MODE[format] : undefined,
    // If a placeholder is explicitly provided, use it. Otherwise the label
    // visually replaces the placeholder via CSS, so we keep it empty.
    placeholder: placeholder ?? (isFocused && label ? label : undefined),
    "aria-label": label ?? ariaLabel ?? undefined,
  };

  // ── Wrapper class name ────────────────────────────────────────
  const wrapperCls = [
    "ui-text-input-wrapper",
    isActive ? "ui-text-input-wrapper--active" : "",
    !label ? "ui-text-input-wrapper--no-label" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
          type={effectiveType}
        />
      )}

      {label && (
        <label htmlFor={id} className="ui-text-input-label">
          {label}
        </label>
      )}

      {/* Material active-indicator bar */}
      <span aria-hidden className="ui-text-input-bar" />
    </div>
  );
};

export default TextInput;
