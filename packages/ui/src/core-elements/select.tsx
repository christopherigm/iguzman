"use client";

import { useState, CSSProperties, SelectHTMLAttributes } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import "./select.css";

export interface SelectOption {
  value: string;
  label: string;
}

type NativeSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "children" | "color" | "className" | "id"
>;

export interface SelectProps extends UIComponentProps, NativeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  options: SelectOption[];
}

export const Select = ({
  value,
  onChange,
  label,
  options,
  className,
  id,
  disabled,
  required,
  ...rest
}: SelectProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const isActive = isFocused || (value !== undefined && value !== "");

  const uiProps = rest as UIComponentProps;
  const safeStyle: CSSProperties = buildStyleProps(uiProps);

  const wrapperCls = [
    "ui-select-wrapper",
    isActive ? "ui-select-wrapper--active" : "",
    !label ? "ui-select-wrapper--no-label" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperCls} style={safeStyle}>
      <select
        id={id}
        className="ui-select"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        required={required}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {label && (
        <label htmlFor={id} className="ui-select-label">
          {label}
        </label>
      )}

      <span aria-hidden className="ui-select-bar" />
    </div>
  );
};

export default Select;
