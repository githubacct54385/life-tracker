import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks one async action at a time, for a button or form.
 * `track(fn)` runs `fn`, keeps `busy` true until it settles, and ignores a second call while the first is running.
 * That second call can be a double tap or Enter pressed twice before React has repainted. Without this guard it would
 * save twice. Nothing is set after the component is gone.
 */
export function useBusy(): [boolean, <T>(action: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const track = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return [busy, track];
}
