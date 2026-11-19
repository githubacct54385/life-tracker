import { useEffect, useRef } from "react";

const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/60 px-4 py-2 text-white";

/**
 * A photo shown as large as the screen allows, for showing it to someone across a counter (MIL-07). Back or Escape closes it
 * and puts focus back where it was. A PDF is not shown here: it opens in the browser's own PDF viewer, which handles every page.
 */
export function DocumentViewer({ title, imageUrl, downloadUrl, onClose }: { title: string; imageUrl: string; downloadUrl?: string; onClose: () => void }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    back.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 p-3">
        <button ref={back} type="button" className={buttonClass} onClick={onClose}>
          Back
        </button>
        <p className="min-w-0 truncate text-sm">{title}</p>
        {downloadUrl ? (
          <a className={buttonClass} href={downloadUrl} download>
            Download
          </a>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
        <img src={imageUrl} alt={title} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}
