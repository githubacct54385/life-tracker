import { useRef, useState, type ChangeEvent } from "react";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES_PER_RECORD, MAX_DOCUMENTS_PER_RECORD, type MaintenanceDocument } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { refreshAvailability } from "../../api/availabilityStatus";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { useBusy } from "../../ui/useBusy";
import { DocumentViewer } from "./DocumentViewer";
import { formatSize, isPdf, kindOf, totalBytes } from "./documentFormat";
import { prepareDocument, type ShrinkImage } from "./prepareDocument";
import { MAX_PAGES, reducePdf, type ReducedPdf } from "./reducePdf";

const MB = 1024 * 1024;
/** A PDF over this size gets a suggestion to make it smaller. */
export const SUGGEST_REDUCE_BYTES = 25 * MB;

const MESSAGES = {
  too_large: `That file is over ${MAX_DOCUMENT_BYTES / MB} MB. Choose a smaller one.`,
  unsupported_type: "Only photos (JPEG, PNG or WebP) and PDFs can be added.",
  limit_reached: `${MAX_DOCUMENTS_PER_RECORD} documents is the most for one service. Delete one to add another.`,
  too_much: `One service can hold ${MAX_DOCUMENT_BYTES_PER_RECORD / MB} MB of documents in all. Delete one to make room.`,
  not_found: "That service is gone. Reload the page.",
  unreadable: "That photo could not be read. Try another.",
  failed: "That did not work. Try again.",
} as const;

const linkClass = "text-gtext underline";
const smallButton = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline";

/** A file that was chosen and checked, and waits for the owner to add it or not. */
interface Staged {
  id: number;
  file: Blob;
  /** The file as it was chosen, so unticking "Make this PDF smaller" can go back to it. */
  original: Blob;
  kind: "Photo" | "PDF";
  originalBytes: number;
  /** True while the file is the smaller copy of a PDF. */
  reduced: boolean;
  /** Set while the PDF is being made smaller. */
  reducing: { page: number; of: number } | null;
  /** Why this file was not made smaller, or why it was not saved. */
  note: string | null;
}

export type ReducePdf = (file: Blob, onPage: (page: number, of: number) => void) => Promise<ReducedPdf>;

/**
 * The photos and PDFs attached to one service (MIL-07). There are no file names: a document is "Photo 1" or "PDF 2".
 * A chosen file shows its size first, and is stored only when the owner presses Add.
 * A PDF can be made smaller before it is added (pages become pictures, in the browser). The owner sees the size before and after.
 * `shrink` and `reduce` are only replaced in tests, because jsdom has no canvas.
 */
export function ServiceDocuments({ recordId, label, documents, onChanged, shrink, reduce = reducePdf }: { recordId: number; label: string; documents: MaintenanceDocument[]; onChanged: () => Promise<void>; shrink?: ShrinkImage; reduce?: ReducePdf }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [progress, setProgress] = useState<{ n: number; of: number } | null>(null);
  // Which reduction of which file is the current one, so the result of one that was removed or undone is thrown away.
  const tokens = useRef(new Map<number, number>());
  const counter = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [viewing, setViewing] = useState<MaintenanceDocument | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<number>>(new Set());
  const full = documents.length >= MAX_DOCUMENTS_PER_RECORD;
  const total = totalBytes(documents);
  const stagedBytes = staged.reduce((sum, item) => sum + item.file.size, 0);

  const names = new Map<number, string>();
  documents.forEach((d, i) => names.set(d.id, `${kindOf(d)} ${i + 1}`));

  const patch = (id: number, change: Partial<Staged>) => setStaged((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  const anyReducing = staged.some((item) => item.reducing !== null);
  const room = MAX_DOCUMENTS_PER_RECORD - documents.length - staged.length;

  /** Says how many of the chosen files were left out, and why. */
  function leftOut(total: number, tooLarge: number, unreadable: number, noRoom: number): string | null {
    const left = tooLarge + unreadable + noRoom;
    if (left === 0) return null;
    if (total === 1) return tooLarge ? MESSAGES.too_large : unreadable ? MESSAGES.unreadable : MESSAGES.limit_reached;
    const reasons = [];
    if (tooLarge) reasons.push(`${tooLarge} over ${MAX_DOCUMENT_BYTES / MB} MB`);
    if (unreadable) reasons.push(`${unreadable} could not be read`);
    if (noRoom) reasons.push(`${noRoom} would not fit (${MAX_DOCUMENTS_PER_RECORD} documents is the most for one service)`);
    return `${left} of ${total} files ${left === 1 ? "was" : "were"} left out: ${reasons.join(", ")}.`;
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length === 0) return;
    setMessage(null);
    setError(null);
    const taken = files.slice(0, Math.max(0, room));
    const counts = { tooLarge: 0, unreadable: 0 };
    const ready: Staged[] = [];
    await track(async () => {
      for (const [i, file] of taken.entries()) {
        if (taken.length > 1) setProgress({ n: i + 1, of: taken.length });
        try {
          const prepared = await prepareDocument(file, shrink);
          if (prepared.status === "too_large") counts.tooLarge += 1;
          else if (prepared.status === "unreadable") counts.unreadable += 1;
          else ready.push({ id: ++counter.current, file: prepared.file, original: prepared.file, kind: file.type.startsWith("image/") ? "Photo" : "PDF", originalBytes: prepared.originalBytes, reduced: false, reducing: null, note: null });
        } catch {
          counts.unreadable += 1;
        }
      }
    });
    setProgress(null);
    setStaged((list) => [...list, ...ready]);
    setError(leftOut(files.length, counts.tooLarge, counts.unreadable, files.length - taken.length));
  }

  /** Stores the files one after another. A saved file leaves the list; one that fails stays, with its reason. */
  async function add() {
    const list = [...staged];
    setMessage(null);
    setError(null);
    const outcome = { added: 0, bytes: 0, failed: 0, stopped: null as string | null, last: "" };
    await track(async () => {
      for (const [i, item] of list.entries()) {
        if (list.length > 1) setProgress({ n: i + 1, of: list.length });
        let result;
        try {
          result = await api.uploadDocument(recordId, item.file);
        } catch {
          patch(item.id, { note: MESSAGES.failed });
          outcome.failed += 1;
          outcome.last = MESSAGES.failed;
          continue;
        }
        if (result.status === "saved") {
          outcome.added += 1;
          outcome.bytes += result.document.bytes;
          setStaged((current) => current.filter((s) => s.id !== item.id));
        } else if (result.status === "limit_reached" || result.status === "too_much" || result.status === "not_found") {
          outcome.stopped = MESSAGES[result.status]; // the service is full: the rest could not be added either
          break;
        } else {
          patch(item.id, { note: MESSAGES[result.status] });
          outcome.failed += 1;
          outcome.last = MESSAGES[result.status];
        }
      }
    });
    setProgress(null);
    if (outcome.added > 0) {
      setMessage(outcome.added === 1 ? `Added ${formatSize(outcome.bytes)}.` : `Added ${outcome.added} documents, ${formatSize(outcome.bytes)} in all.`);
      await onChanged();
    }
    if (outcome.stopped) setError(outcome.stopped);
    else if (outcome.failed === 1) setError(outcome.last);
    else if (outcome.failed > 1) setError(`${outcome.failed} files could not be added. Each one says why.`);
  }

  function cancel() {
    tokens.current.clear();
    setStaged([]);
    setProgress(null);
    setError(null);
  }

  function unstage(id: number) {
    tokens.current.delete(id);
    setStaged((list) => list.filter((item) => item.id !== id));
  }

  async function toggleReduce(item: Staged, on: boolean) {
    patch(item.id, { note: null });
    if (!on) {
      tokens.current.delete(item.id);
      return patch(item.id, { file: item.original, originalBytes: item.original.size, reduced: false, reducing: null });
    }
    const mine = ++counter.current;
    tokens.current.set(item.id, mine);
    const live = () => tokens.current.get(item.id) === mine;
    patch(item.id, { reducing: { page: 0, of: 0 } });
    try {
      const result = await reduce(item.original, (page, of) => live() && patch(item.id, { reducing: { page, of } }));
      if (!live()) return;
      if (result.status === "unreadable") return patch(item.id, { note: "This PDF could not be made smaller. It may be damaged or protected. The original is kept." });
      if (result.status === "too_long") return patch(item.id, { note: `This PDF has more than ${MAX_PAGES} pages, which is too many to make smaller here. The original is kept.` });
      if (result.file.size >= item.original.size) return patch(item.id, { note: "Making it smaller did not help, so the original is kept." });
      patch(item.id, { file: result.file, originalBytes: item.original.size, reduced: true });
    } catch {
      if (live()) patch(item.id, { note: "This PDF could not be made smaller. The original is kept." });
    } finally {
      if (live()) patch(item.id, { reducing: null });
    }
  }

  async function remove(id: number) {
    setMessage(null);
    setError(null);
    await track(async () => {
      try {
        await api.deleteDocument(id);
        setConfirming(null);
        setMessage("Document deleted.");
        await onChanged();
      } catch {
        setError(MESSAGES.failed);
      }
    });
  }


  return (
    <div className="mt-3 border-t border-line pt-3" role="group" aria-label={`Documents for ${label}`}>
      <p className="text-sm font-bold">
        Documents{documents.length > 0 && <span className="font-normal text-muted"> ({documents.length} &middot; {formatSize(total)} in all)</span>}
      </p>
      {documents.length > 0 && (
        <ul className="mt-2 space-y-2">
          {documents.map((doc) => {
            const name = names.get(doc.id)!;
            const url = api.documentUrl(doc);
            const downloadUrl = api.documentDownloadUrl(doc);
            return (
              <li key={doc.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {broken.has(doc.id) ? (
                    <span className="text-sm text-muted">{name} (the file is missing)</span>
                  ) : url === undefined ? (
                    <span className="text-sm">
                      {name} &middot; {formatSize(doc.bytes)}
                    </span>
                  ) : isPdf(doc) ? (
                    <a className={`${linkClass} inline-flex min-h-11 items-center`} href={url} target="_blank" rel="noopener noreferrer">
                      Open {name} <span className="ml-1 text-sm text-muted">({formatSize(doc.bytes)})</span>
                    </a>
                  ) : (
                    <>
                      <button type="button" aria-label={`View ${name}`} onClick={() => setViewing(doc)}>
                        <img src={url} alt="" loading="lazy" className="size-20 rounded-lg border border-line object-cover" onError={() => {
                          setBroken((b) => new Set(b).add(doc.id));
                          // A photo that will not load may mean document storage is down: ask, so the banner can say so (OPS-14).
                          void refreshAvailability(api);
                        }} />
                      </button>
                      <span className="text-sm">
                        {name} &middot; {formatSize(doc.bytes)}
                      </span>
                    </>
                  )}
                  {downloadUrl && !broken.has(doc.id) && (
                    <a className={smallButton} href={downloadUrl} download aria-label={`Download ${name}`}>
                      Download
                    </a>
                  )}
                  {confirming !== doc.id && (
                    <button type="button" className={smallButton} aria-label={`Delete ${name}`} onClick={() => setConfirming(doc.id)}>
                      Delete
                    </button>
                  )}
                </div>
                <Presence>
                  {confirming === doc.id ? (
                    <div role="alert" className="mt-2 rounded-xl border border-line bg-sunk p-4 text-ink">
                      <p>Delete {name}? It is removed for good.</p>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" busy={busy} onClick={() => void remove(doc.id)}>
                          Yes, delete
                        </Button>
                        <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Presence>
              </li>
            );
          })}
        </ul>
      )}

      <Presence>
        {staged.length > 0 ? (
          <div className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
            {staged.length === 1 ? (
              <p>
                Ready to add: {staged[0]!.kind}, <b>{formatSize(staged[0]!.file.size)}</b>
                {staged[0]!.file.size < staged[0]!.originalBytes && <> (made smaller from {formatSize(staged[0]!.originalBytes)})</>}
              </p>
            ) : (
              <p>
                Ready to add: {staged.length} files, <b>{formatSize(stagedBytes)}</b> in all
              </p>
            )}
            {stagedBytes + total > MAX_DOCUMENT_BYTES_PER_RECORD && (
              <p className="mt-1 text-sm">These are more than the {MAX_DOCUMENT_BYTES_PER_RECORD / MB} MB one service can hold. The first ones are added, and the rest stay here.</p>
            )}
            <ul className="mt-2 space-y-3">
              {staged.map((item, i) => (
                <StagedRow key={item.id} item={item} name={`${item.kind} ${documents.length + i + 1}`} many={staged.length > 1} locked={busy || (anyReducing && item.reducing === null)} onToggle={(on) => void toggleReduce(item, on)} onRemove={() => unstage(item.id)} />
              ))}
            </ul>
            {progress && (
              <p role="status" className="mt-2 text-sm">
                Adding {progress.n} of {progress.of}…
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button type="button" busy={busy} disabled={anyReducing} onClick={() => void add()}>
                {staged.length > 1 ? "Add all to this service" : "Add to this service"}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Presence>

      {full ? (
        <p className="mt-2 text-sm text-muted">{MESSAGES.limit_reached}</p>
      ) : room > 0 ? (
        <>
          <label className={`relative mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-ink focus-within:outline-2 focus-within:outline-offset-2 ${busy ? "cursor-progress opacity-80" : "cursor-pointer"}`}>
            {busy && <span aria-hidden="true" className="lt-spinner" />}
            <span>{busy ? (progress ? `Checking ${progress.n} of ${progress.of}…` : "Checking…") : staged.length > 0 ? "Choose more" : documents.length === 0 ? "Add photos or PDFs" : "Add more"}</span>
            <input type="file" multiple className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-progress" accept="image/*,application/pdf" aria-label={`Add photos or PDFs to ${label}`} disabled={busy} onChange={(e) => void choose(e)} />
          </label>
          {staged.length === 0 && room > 1 && <p className="mt-1 text-sm text-muted">You can choose several at once.</p>}
        </>
      ) : null}
      <Presence>{message ? <p role="status" className="mt-2 text-sm text-gtext">{message}</p> : null}</Presence>
      <Presence>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</Presence>

      {viewing && api.documentUrl(viewing) && (
        <DocumentViewer title={`${names.get(viewing.id) ?? "Photo"} for ${label}`} imageUrl={api.documentUrl(viewing)!} downloadUrl={api.documentDownloadUrl(viewing)} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/** One chosen file in the "Ready to add" list. A PDF has its own box to make it smaller. */
function StagedRow({ item, name, many, locked, onToggle, onRemove }: { item: Staged; name: string; many: boolean; locked: boolean; onToggle: (on: boolean) => void; onRemove: () => void }) {
  return (
    <li>
      {many && (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p>
            {name} &middot; <b>{formatSize(item.file.size)}</b>
            {item.file.size < item.originalBytes && <> (made smaller from {formatSize(item.originalBytes)})</>}
          </p>
          <button type="button" className={smallButton} aria-label={`Remove ${name} from the list`} disabled={locked || item.reducing !== null} onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
      {item.kind === "PDF" && (
        <div className={many ? "mt-1" : "mt-3"}>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-6" checked={item.reduced || item.reducing !== null} disabled={locked || item.reducing !== null} onChange={(e) => onToggle(e.target.checked)} />
            <span>{many ? `Make ${name} smaller` : "Make this PDF smaller"}</span>
          </label>
          <p className="text-sm text-muted">Each page becomes a picture, so the text can no longer be selected or searched. It happens on this device.</p>
          {!item.reduced && item.reducing === null && item.original.size > SUGGEST_REDUCE_BYTES && <p className="mt-1 text-sm">This PDF is large. Making it smaller is a good idea.</p>}
          {item.reducing !== null && (
            <p role="status" className="mt-1 flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="lt-spinner" />
              {item.reducing.of > 0 ? `Making it smaller: page ${item.reducing.page} of ${item.reducing.of}…` : "Opening the PDF…"}
            </p>
          )}
          {item.reduced && (
            <p role="status" className="mt-1 text-sm">
              {formatSize(item.originalBytes)} &rarr; <b>{formatSize(item.file.size)}</b>
            </p>
          )}
        </div>
      )}
      {item.note && <p role="status" className="mt-1 text-sm">{item.note}</p>}
    </li>
  );
}
