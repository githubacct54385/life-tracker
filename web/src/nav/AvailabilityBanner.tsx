import { useEffect } from "react";
import { unavailableBanner, unavailableParts } from "@life-tracker/shared";
import { useApi } from "../api/ApiContext";
import { setUnavailable, useUnavailableParts } from "../api/availabilityStatus";

/** While a part is down, ask the server how things are this often. The banner goes away by itself when it is back (AC-OPS-14.3). */
export const RECHECK_MS = 30_000;

/**
 * "The database is not available right now. Please try again in a few minutes. Your saved data is safe." (OPS-14).
 * It shows only while the server has said a part is down, names the part in plain words, and checks again every 30 seconds so it
 * clears without a reload. It is a polite live region, so a screen reader hears it once, and it never shows in demo mode (the demo has no server).
 */
export function AvailabilityBanner() {
  const api = useApi();
  const down = useUnavailableParts();
  const anyDown = down.length > 0;

  useEffect(() => {
    if (!anyDown) return;
    let current = true;
    const timer = setInterval(() => {
      api
        .getAvailability()
        .then((availability) => current && setUnavailable(unavailableParts(availability)))
        // A failed check changes nothing: a 503 has already updated the list, and no network at all is the offline notice's job.
        .catch(() => undefined);
    }, RECHECK_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [api, anyDown]);

  if (!anyDown) return null;
  return (
    <p role="status" className="mx-auto mb-4 max-w-3xl rounded-xl border border-ink bg-sunk px-4 py-3 text-sm text-ink">
      {unavailableBanner(down)}
    </p>
  );
}
