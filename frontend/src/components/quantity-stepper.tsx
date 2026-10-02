"use client";

import { Minus, Plus } from "lucide-react";

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
  size?: "md" | "sm";
};

export function QuantityStepper({ value, min = 1, max, onChange, disabled, label, size = "md" }: Props) {
  const h = size === "sm" ? "h-10" : "h-12";
  const w = size === "sm" ? "w-10" : "w-12";
  return (
    <div className={`inline-flex ${h} items-center rounded-full border border-line-strong bg-paper`} role="group" aria-label={label}>
      <button
        type="button"
        className={`inline-flex ${h} ${w} items-center justify-center rounded-full text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-35`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
        <span className="sr-only">Quantity </span>
        {value}
      </span>
      <button
        type="button"
        className={`inline-flex ${h} ${w} items-center justify-center rounded-full text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-35`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
