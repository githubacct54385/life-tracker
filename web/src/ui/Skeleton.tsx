/** A loading placeholder shaped like the content that is coming, so the page does not jump when it arrives. */
export function Skeleton({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  const widths = ["w-2/5", "w-4/5", "w-3/5"];
  return (
    <div role="status" aria-live="polite" className={`mt-3 space-y-2 ${className}`.trim()}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden="true" className={`lt-skeleton h-4 rounded-md ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}
