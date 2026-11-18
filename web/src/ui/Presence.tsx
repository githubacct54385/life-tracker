import { useEffect, useRef, useState, type ReactNode } from "react";

/** How long the leave animation runs. Keep in step with `.lt-leave` in index.css. */
export const LEAVE_MS = 160;

/** True when the device asks for less motion. Treated as true where `matchMedia` is missing (tests), so nothing waits. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fades and slides its children in when they appear, and out (collapsing the space) when they go.
 * Pass the content or `null`/`false`: `<Presence>{open ? <Panel /> : null}</Presence>`.
 * The last content is kept on screen until the leave animation ends. With reduced motion there is no animation and
 * nothing is kept, so the content is gone at once.
 */
export function Presence({ children }: { children?: ReactNode }) {
  const present = children !== null && children !== undefined && children !== false;
  const last = useRef<ReactNode>(children);
  if (present) last.current = children;
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(!present);

  useEffect(() => {
    if (present) {
      setGone(false);
      setLeaving(false);
      return;
    }
    if (prefersReducedMotion()) {
      setGone(true);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      setGone(true);
      setLeaving(false);
    }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [present]);

  if (!present && (gone || prefersReducedMotion())) return null;
  return (
    <div className={`lt-presence ${present ? "lt-enter" : "lt-leave"}`} aria-hidden={present ? undefined : true} data-leaving={leaving && !present ? "true" : undefined}>
      <div className="lt-presence-inner">{last.current}</div>
    </div>
  );
}
