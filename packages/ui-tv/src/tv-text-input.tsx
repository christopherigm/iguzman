import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useRef } from "react";
import type { Ref } from "react";
import "./tokens.css";

export interface TvTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Required for accessibility - there is no visible <label> on TV. */
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * D-pad-focusable text field. There is no "native TV input" widget on Tizen -
 * pressing Enter focuses a plain <input>, which opens the TV's system on-screen
 * keyboard (IME).
 */
export function TvTextInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
}: TvTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref, focused } = useFocusable({
    onEnterPress: () => inputRef.current?.focus(),
  });

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
      />
    </div>
  );
}
