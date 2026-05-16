"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";

import {
  selectFieldMenuClassName,
  selectFieldOptionClassName,
  type SelectFieldPlacement,
  selectFieldRootClassName,
  selectFieldTriggerClassName,
  type SelectFieldTone,
} from "./select-field-styles";

export interface SelectFieldOption {
  label: string;
  value: string;
}

export function SelectField({
  ariaLabel,
  className = "",
  onChange,
  options,
  placement = "bottom",
  tone = "default",
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  placement?: SelectFieldPlacement;
  tone?: SelectFieldTone;
  value: string;
}): ReactElement {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0] ?? null;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function choose(nextValue: string): void {
    onChange(nextValue);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + options.length) % options.length;
    const nextOption = options[nextIndex];
    if (nextOption !== undefined) {
      choose(nextOption.value);
    }
  }

  return (
    <div className={selectFieldRootClassName(className)} ref={rootRef}>
      <button
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={selectFieldTriggerClassName(tone)}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span className="truncate">{selected?.label ?? "未选择"}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className={selectFieldMenuClassName(tone, placement)} id={id} role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                aria-selected={active}
                className={selectFieldOptionClassName(active, tone)}
                key={option.value}
                onClick={() => choose(option.value)}
                role="option"
                type="button"
              >
                <span className="truncate">{option.label}</span>
                {active ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
