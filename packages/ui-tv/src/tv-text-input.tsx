import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, Ref } from "react";
import "./tokens.css";

export interface TvTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Required for accessibility - there is no visible <label> on TV. */
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  /**
   * Called when the user presses Enter / "Done" on the native on-screen
   * keyboard (or the remote Enter while typing). Lets a parent submit the value
   * straight from the keyboard instead of forcing a walk to an OK button.
   */
  onSubmit?: () => void;
}

/**
 * D-pad-focusable text field. There is no "native TV input" widget on Tizen -
 * pressing Enter focuses a plain <input>, which opens the TV's system on-screen
 * keyboard (IME).
 *
 * The IME leaves the <input> as the DOM `activeElement` even after it closes, so
 * any later Enter (e.g. pressing a sibling OK/Cancel button) is swallowed by the
 * still-focused input and reopens the keyboard. To prevent that we blur the
 * <input> the instant D-pad focus leaves this field, handing control back to
 * spatial navigation.
 */
export function TvTextInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  onSubmit,
}: TvTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref, focused } = useFocusable({
    onEnterPress: () => inputRef.current?.focus(),
  });

  // Once spatial navigation moves off this field (e.g. onto an OK/Cancel
  // button), release the DOM focus the IME left on the <input> so the next
  // Enter reaches the newly-focused control instead of reopening the keyboard.
  useEffect(() => {
    if (!focused) inputRef.current?.blur();
  }, [focused]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Blur first so the keyboard doesn't reopen, then submit. stopPropagation
    // keeps the wrapper's onEnterPress (which refocuses the input) from firing
    // on this same keypress.
    event.preventDefault();
    event.stopPropagation();
    inputRef.current?.blur();
    onSubmit?.();
  };

  const cls = [
    "tv-text-input",
    "tv-focusable",
    focused ? "tv-focusable--focused" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={cls}>
      <input
        ref={inputRef}
        className="tv-text-input__field"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
