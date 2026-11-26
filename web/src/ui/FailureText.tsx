import { unavailableSentence, type DependencyPart } from "@life-tracker/shared";
import { useUnavailableParts } from "../api/availabilityStatus";

/**
 * The words for a request that failed. When the server has said a part it needs is not available, this says which one in plain words
 * (AC-OPS-14.4). Otherwise it shows `fallback`. `needs` is the parts the failed request depends on: most pages need the database and
 * the sign-in check, and documents need document storage.
 */
export function FailureText({ fallback, needs = ["database", "signIn"] }: { fallback: string; needs?: readonly DependencyPart[] }) {
  const relevant = useUnavailableParts().filter((part) => needs.includes(part));
  return <>{relevant.length ? `${relevant.map(unavailableSentence).join(" ")} Try again in a few minutes.` : fallback}</>;
}
