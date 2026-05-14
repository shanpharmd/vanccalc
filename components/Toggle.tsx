"use client";

import clsx from "clsx";

interface ToggleProps<T extends string> {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
  className?: string;
}

export function Toggle<T extends string>({ value, options, onChange, className }: ToggleProps<T>) {
  return (
    <div className={clsx("toggle-group", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx("toggle-btn", value === o.value && "toggle-btn-active")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
