import { useEffect, useState } from "react";

export type Load<T> = { state: "loading" } | { state: "error" } | { state: "ok"; value: T };

/** Each Home tile loads on its own, so one failing request leaves the others showing. */
export function useLoad<T>(fetcher: () => Promise<T>): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let current = true;
    fetcher()
      .then((value) => current && setResult({ state: "ok", value }))
      .catch(() => current && setResult({ state: "error" }));
    return () => {
      current = false;
    };
    // The fetcher is rebuilt on every render; the data source (api) is what decides when to load again.
  }, []);
  return result;
}
