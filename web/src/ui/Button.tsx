import type { ButtonHTMLAttributes } from "react";

const BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 ";
// A button that cannot be used yet turns grey. One that is working keeps its colour and shows the spinner.
const UNAVAILABLE = "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted";
const WORKING = "cursor-progress opacity-80";
const VARIANTS = {
  primary: "bg-g700 font-bold text-white",
  ghost: "border border-line text-ink",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  /** True while the action this button starts is running: the button is disabled and shows a spinner. */
  busy?: boolean;
}

/**
 * The app's button. While `busy` it is disabled (so it cannot be pressed twice), shows a spinner, and says "Working"
 * to screen readers through `aria-busy` and hidden text. The label stays, so the button keeps its width.
 */
export function Button({ variant = "primary", busy = false, disabled, className = "", type = "button", children, ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`${BASE} ${VARIANTS[variant]} ${busy ? WORKING : UNAVAILABLE} ${className}`.trim()}>
      {busy && <span aria-hidden="true" className="lt-spinner" />}
      {children}
      {busy && <span className="sr-only">Working…</span>}
    </button>
  );
}
