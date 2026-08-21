"use client";

import {
  useState,
  useRef,
  useId,
  useEffect,
  useMemo,
  CSSProperties,
  InputHTMLAttributes,
} from "react";
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

/** What the picker opens on when neither the value nor the fallback is a hex. */
const DEFAULT_SWATCH_FALLBACK = "#000000";

/**
 * The colour a native `<input type="color">` can actually open on. It accepts
 * `#rrggbb` and nothing else, and answers anything else by showing black -
 * which reads as "the colour was lost". So widen a `#rgb`, drop a `#rrggbbaa`'s
 * alpha, and hand every other notation (`gold`, `rgb(...)`, `var(--accent)`) to
 * the fallback.
 *
 * Nothing is lost by that: the tile *behind* the picker is painted with the raw
 * value, so the swatch still tells the truth about a colour this cannot parse -
 * only the dialog's starting point falls back.
 */
const toPickerHex = (value: string, fallback: string): string => {
  const v = value.trim();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return v.slice(0, 7);
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [r, g, b] = [v[1], v[2], v[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-f]{6}$/i.test(fallback.trim())
    ? fallback.trim()
    : DEFAULT_SWATCH_FALLBACK;
};

/**
 * One choice in an autocomplete field.
 *
 * Structurally identical to `Select`'s `SelectOption` - so an options array
 * already built for a `Select` can be handed straight to `TextInput` - but
 * declared here rather than imported, so a plain text field does not pull
 * `Select` and its stylesheet into every bundle that has one.
 */
export interface TextInputOption {
  value: string;
  label: string;
}

/** Nothing to match against. Module-level so the identity is stable. */
const NO_OPTIONS: TextInputOption[] = [];

/**
 * Fold a label and a query to the same shape before matching them:
 * case-insensitive **and** diacritic-insensitive, so `cienaga` finds `Ciénaga`.
 * The catalogs these lists come from are authored with accents and nobody types
 * them into a search box.
 */
const foldForSearch = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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
  /**
   * Invalid state. Pass a string to render it as the field's message (replacing
   * `helperText`); pass `true` to style the field as invalid without a message.
   * Either form sets `aria-invalid` on the control.
   */
  error?: boolean | string;
  /** Hint rendered beneath the field. Superseded by a string `error`. */
  helperText?: string;
  /**
   * Turns the field into a **searchable select** (a combobox): the reader types
   * to filter this list and picks from it, and `value` / `onChange` then speak
   * in option *values* exactly as `Select`'s do - the field itself displays the
   * matching option's `label`.
   *
   * Matching is case- and accent-insensitive across the whole label. Text that
   * matches no option is discarded when the field loses focus (the value is an
   * option value, so free text has nothing to be); emptying the field is how a
   * selection is cleared, and emits `onChange("")`.
   *
   * Mutually exclusive with `format` and `type`, both of which are ignored while
   * options are present.
   */
  options?: TextInputOption[];
  /**
   * Row shown when the query matches no option. **Defaults to English** - this
   * package is i18n-agnostic, so a localised app passes its own.
   */
  noOptionsLabel?: string;
  /**
   * Turns the field into a **colour field**: an ordinary editable text input
   * holding the raw value, with a round swatch at its end that opens the
   * browser's own colour picker.
   *
   * Deliberately not `type="color"`, which replaces the whole field with the
   * browser's swatch - a small target that can only ever hold `#rrggbb`. Here
   * the *value* stays free text, so `gold`, `rgb(0 0 0 / 50%)` and a blank all
   * survive a round trip, and **emptying the field is how a colour is cleared**
   * (a native picker has no empty state - it shows black and means it).
   *
   * The tile is painted with the raw value, whatever notation it is in, and
   * shows a struck-through "no colour" state when the field is empty.
   *
   * Ignored on a `multirow` field and on a combobox (`options`), whose own
   * dropdown owns that corner of the field.
   */
  swatch?: boolean;
  /**
   * The `#rrggbb` the picker opens on when the value is not a hex it can show
   * (blank, `gold`, a `var()`). Defaults to `#000000`. It is only the dialog's
   * starting point - it is never emitted, and never painted on the tile.
   */
  swatchFallback?: string;
  /**
   * Accessible name for the swatch, which is a second control beside the text
   * field and needs a name of its own. **Defaults to English**, like
   * `noOptionsLabel` - a localised app passes its own.
   */
  swatchLabel?: string;
  /**
   * Where the *picker's* `#rrggbb` goes, when that is not simply the field's new
   * value. Given, it replaces `onChange` for the swatch alone - the text box
   * still emits through `onChange` as usual.
   *
   * It exists because the two controls stop meaning the same thing the moment
   * the value carries something a picker cannot express. A gradient stop is the
   * case: its notation holds an alpha the swatch knows nothing about, so a
   * colour picked on a half-transparent stop has to be folded back into the
   * value rather than replace it - while text the operator typed is the whole
   * notation and replaces it outright.
   *
   * Only useful on a controlled field: nothing is written to an uncontrolled
   * field's own state, since the caller is deciding what the value becomes.
   */
  onSwatchChange?: (hex: string) => void;
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
 *
 * @example Validation - a string `error` replaces `helperText` and sets `aria-invalid`.
 * ```tsx
 * <TextInput label="Password" type="password" helperText="At least 8 characters" />
 * <TextInput label="Password" type="password" error="This password is too common." />
 * ```
 *
 * @example Colour - an editable value with a picker beside it. Emptying it clears the colour.
 * ```tsx
 * // color === "" | "#c0a062" | "gold"
 * <TextInput label="Colour" swatch value={color} onChange={setColor} />
 * ```
 *
 * @example Autocomplete - a `Select` you can type into. `value`/`onChange` are option values.
 * ```tsx
 * // place === "42", displayed as "Lake Estes (Lake) - Larimer"
 * <TextInput label="Place" options={places} value={place} onChange={setPlace} />
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
  error,
  helperText,
  options,
  noOptionsLabel = "No matches",
  swatch = false,
  swatchFallback = DEFAULT_SWATCH_FALLBACK,
  swatchLabel = "Pick a colour",
  onSwatchChange,
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

  // ── Autocomplete (combobox) ────────────────────────────────────
  // A combobox is a text field whose *value* is an option value, so it renders
  // as plain text and every mask is off the table.
  const isCombobox = options !== undefined;
  const comboOptions = options ?? NO_OPTIONS;

  // What the reader has typed. `null` means "not typing", and the field then
  // shows the selected option's label - which is what a closed select looks like.
  const [query, setQuery] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selectedLabel = useMemo(
    () =>
      comboOptions.find((option) => option.value === currentValue)?.label ?? "",
    [comboOptions, currentValue],
  );

  const matches = useMemo(() => {
    const folded = foldForSearch(query ?? "");
    // An untouched field lists everything: the reader opened a select, and only
    // typing turns it into a search.
    if (!folded) return comboOptions;
    return comboOptions.filter((option) =>
      foldForSearch(option.label).includes(folded),
    );
  }, [comboOptions, query]);

  // Clamped rather than reset on every filter, so narrowing the query cannot
  // point the highlight past the end of the list it is drawn over.
  const activeIndex = Math.min(highlight, Math.max(matches.length - 1, 0));

  // A mask always renders as a plain text field so we control the formatting;
  // the displayed value is masked, while the stored/emitted value stays raw.
  const isMasked = format !== "text" && !isCombobox;

  // A colour field is a *text* field with a picker beside it - the value is free
  // text (`gold`, a `var()`, a blank) and only the tile is a colour. So the
  // control is `type="text"` even when the caller also asked for `type="color"`,
  // which would otherwise hand the whole field to the browser's own swatch.
  const hasSwatch = swatch && !multirow && !isCombobox;
  const effectiveType =
    isMasked || isCombobox ? "text" : hasSwatch ? "text" : type;
  const displayValue = isCombobox
    ? (query ?? selectedLabel)
    : isMasked
      ? toDisplayValue(currentValue ?? "", format)
      : (currentValue ?? "");

  // Track focus independently so the label stays floated while typing.
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Arrow-keying past the visible rows would otherwise look frozen: these lists
  // run to hundreds of options and only a handful of them are on screen.
  useEffect(() => {
    if (!isOpen) return;
    const row = listRef.current?.children[activeIndex];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

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
  const emit = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  const commitOption = (option: TextInputOption) => {
    emit(option.value);
    setQuery(null);
    setIsOpen(false);
    setHighlight(0);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (isCombobox) {
      const typed = e.target.value;
      setQuery(typed);
      setIsOpen(true);
      setHighlight(0);
      // Emptying the field is the only way to clear a selection - there is no
      // separate clear button, and an id left behind an empty box is worse than
      // asking the question again.
      if (typed === "") emit("");
      return;
    }
    emit(isMasked ? toRawValue(e.target.value, format) : e.target.value);
  };

  const handleFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setIsFocused(true);
    if (isCombobox) {
      setIsOpen(true);
      // Select the label so the first keystroke replaces it rather than being
      // appended to it - "Lake Estes" + "riv" matches nothing.
      e.currentTarget.select();
    }
    (rest as NativeInputProps).onFocus?.(
      e as React.FocusEvent<HTMLInputElement>,
    );
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setIsFocused(false);
    if (isCombobox) {
      setIsOpen(false);
      // Whatever was typed is dropped: this field's value is an option value, so
      // a half-typed name has nothing to be. The display falls back to the
      // selection - or to empty, if the reader cleared it.
      setQuery(null);
    }
    (rest as NativeInputProps).onBlur?.(
      e as React.FocusEvent<HTMLInputElement>,
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (isCombobox) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (isOpen) setHighlight(Math.min(activeIndex + 1, matches.length - 1));
        else setIsOpen(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight(Math.max(activeIndex - 1, 0));
      } else if (e.key === "Enter") {
        const picked = matches[activeIndex];
        if (isOpen && picked) {
          // Enter must never reach an enclosing <form>: picking an option is not
          // submitting the record it belongs to.
          e.preventDefault();
          commitOption(picked);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setQuery(null);
      }
    }
    onKeyDown?.(e);
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

  // ── Validation state ──────────────────────────────────────────
  // A string `error` doubles as the message; `true` only paints the field.
  const hasError = Boolean(error);
  const message = (typeof error === "string" ? error : "") || helperText;
  const reactId = useId();
  const messageId = message ? `${id ?? reactId}-message` : undefined;
  const listId = `${id ?? reactId}-options`;

  // ── Shared props for <input> / <textarea> ─────────────────────
  const sharedProps = {
    id,
    ref: assignRef,
    "aria-invalid": hasError || undefined,
    "aria-describedby": messageId,
    value: displayValue,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    disabled,
    required,
    maxLength,
    onKeyDown: handleKeyDown,
    onPaste,
    min,
    max,
    step,
    inputMode: isMasked ? FORMAT_INPUT_MODE[format] : undefined,
    // If a placeholder is explicitly provided, use it. Otherwise the label
    // visually replaces the placeholder via CSS, so we keep it empty.
    placeholder: placeholder ?? (isFocused && label ? label : undefined),
    "aria-label": label ?? ariaLabel ?? undefined,
    ...(isCombobox
      ? {
          // Focus opens the list, but a field that has just been picked from is
          // still focused - so a second click on it fires no focus event, and
          // without this the list could only be reopened by typing.
          onClick: () => setIsOpen(true),
          role: "combobox",
          "aria-expanded": isOpen,
          "aria-controls": listId,
          "aria-autocomplete": "list" as const,
          "aria-activedescendant":
            isOpen && matches[activeIndex]
              ? `${listId}-${activeIndex}`
              : undefined,
          // The browser's own autofill panel would be drawn over the list.
          autoComplete: "off",
        }
      : null),
  };

  // ── Wrapper class name ────────────────────────────────────────
  const wrapperCls = [
    "ui-text-input-wrapper",
    isActive ? "ui-text-input-wrapper--active" : "",
    !label ? "ui-text-input-wrapper--no-label" : "",
    hasSwatch ? "ui-text-input-wrapper--swatch" : "",
    hasError ? "ui-text-input-wrapper--error" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={wrapperCls} style={safeStyle}>
      {/* The bar is anchored to this box, not the wrapper, so a message below
          the field does not drag the indicator away from the input. */}
      <div className="ui-text-input-field">
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

        {/* The tile carries the colour and the picker is invisible on top of
            it, rather than the other way round: a native `<input type="color">`
            can only *show* `#rrggbb`, so painting it with the raw value is what
            lets `gold` and `rgb(...)` read correctly - and lets a blank read as
            blank instead of as black, which is the one thing the native control
            cannot say. It sits before the bar so `~ .ui-text-input-bar` still
            reaches it from the input. */}
        {hasSwatch && (
          <span
            className={[
              "ui-text-input-swatch",
              (currentValue ?? "").trim() === ""
                ? "ui-text-input-swatch--empty"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ background: (currentValue ?? "").trim() || undefined }}
          >
            <input
              type="color"
              className="ui-text-input-swatch__input"
              value={toPickerHex(currentValue ?? "", swatchFallback)}
              onChange={(e) =>
                onSwatchChange
                  ? onSwatchChange(e.target.value)
                  : emit(e.target.value)
              }
              disabled={disabled}
              aria-label={swatchLabel}
            />
          </span>
        )}

        {label && (
          <label htmlFor={id} className="ui-text-input-label">
            {label}
          </label>
        )}

        {/* Material active-indicator bar */}
        <span aria-hidden className="ui-text-input-bar" />

        {/* The autocomplete list. Every row is a real <button> - a <div
            role="option"> would need its own key handlers to be operable at
            all, and the keyboard already lives on the input above. */}
        {isCombobox && isOpen && (
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label ?? ariaLabel}
            className="ui-text-input-options"
          >
            {matches.length === 0 ? (
              <span
                role="presentation"
                className="ui-text-input-option ui-text-input-option--empty"
              >
                {noOptionsLabel}
              </span>
            ) : (
              matches.map((option, index) => (
                <button
                  key={option.value}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === currentValue}
                  // Out of the tab order: a combobox is driven from its input,
                  // and Tab has to leave the field rather than walk the list.
                  tabIndex={-1}
                  className={[
                    "ui-text-input-option",
                    index === activeIndex ? "ui-text-input-option--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  // The press must not blur the input first, or `handleBlur`
                  // closes this list before the click can land on it.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitOption(option)}
                  onMouseEnter={() => setHighlight(index)}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {message && (
        <span
          id={messageId}
          role={hasError ? "alert" : undefined}
          className="ui-text-input-message"
        >
          {message}
        </span>
      )}
    </div>
  );
};

export default TextInput;
