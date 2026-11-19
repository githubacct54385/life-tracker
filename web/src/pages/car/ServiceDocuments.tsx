import { useState, type ChangeEvent } from "react";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES_PER_RECORD, MAX_DOCUMENTS_PER_RECORD, type MaintenanceDocument } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { useBusy } from "../../ui/useBusy";
import { DocumentViewer } from "./DocumentViewer";
import { formatSize, isPdf, kindOf, totalBytes } from "./documentFormat";
import { prepareDocument, type ShrinkImage } from "./prepareDocument";

const MB = 1024 * 1024;

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
  file: Blob;
  kind: "Photo" | "PDF";
  originalBytes: number;
}

/**
 * The photos and PDFs attached to one service (MIL-07). There are no file names: a document is "Photo 1" or "PDF 2".
 * A chosen file shows its size first, and is stored only when the owner presses Add.
 * `shrink` is only replaced in tests, because jsdom has no canvas.
 */
export function ServiceDocuments({ recordId, label, documents, onChanged, shrink }: { recordId: number; label: string; documents: MaintenanceDocument[]; onChanged: () => Promise<void>; shrink?: ShrinkImage }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [staged, setStaged] = useState<Staged | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [viewing, setViewing] = useState<MaintenanceDocument | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<number>>(new Set());
  const full = documents.length >= MAX_DOCUMENTS_PER_RECORD;
  const total = totalBytes(documents);

  const names = new Map<number, string>();
  documents.forEach((d, i) => names.set(d.id, `${kindOf(d)} ${i + 1}`));

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setMessage(null);
    setError(null);
    setStaged(null);
    await track(async () => {
      try {
        const prepared = await prepareDocument(file, shrink);
        if (prepared.status !== "ready") return setError(MESSAGES[prepared.status === "too_large" ? "too_large" : "unreadable"]);
        setStaged({ file: prepared.file, kind: file.type.startsWith("image/") ? "Photo" : "PDF", originalBytes: prepared.originalBytes });
      } catch {
        setError(MESSAGES.failed);
      }
    });
  }

  async function add() {
    if (!staged) return;
    setMessage(null);
    setError(null);
    await track(async () => {
      try {
        const result = await api.uploadDocument(recordId, staged.file);
        if (result.status !== "saved") return setError(MESSAGES[result.status]);
        setStaged(null);
        setMessage(`Added ${formatSize(result.document.bytes)}.`);
        await onChanged();
      } catch {
        setError(MESSAGES.failed);
      }
    });
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

  const shrunk = staged !== null && staged.file.size < staged.originalBytes;

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
                        <img src={url} alt="" loading="lazy" className="size-20 rounded-lg border border-line object-cover" onError={() => setBroken((b) => new Set(b).add(doc.id))} />
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
        {staged ? (
          <div className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
            <p>
              Ready to add: {staged.kind}, <b>{formatSize(staged.file.size)}</b>
              {shrunk && <> (made smaller from {formatSize(staged.originalBytes)})</>}
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" busy={busy} onClick={() => void add()}>
                Add to this service
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setStaged(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Presence>

      {full ? (
        <p className="mt-2 text-sm text-muted">{MESSAGES.limit_reached}</p>
      ) : (
        staged === null && (
          <label className={`relative mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-ink focus-within:outline-2 focus-within:outline-offset-2 ${busy ? "cursor-progress opacity-80" : "cursor-pointer"}`}>
            {busy && <span aria-hidden="true" className="lt-spinner" />}
            <span>{busy ? "Checking…" : documents.length === 0 ? "Add a photo or PDF" : "Add another"}</span>
            <input type="file" className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-progress" accept="image/*,application/pdf" aria-label={`Add a photo or PDF to ${label}`} disabled={busy} onChange={(e) => void choose(e)} />
          </label>
        )
      )}
      <Presence>{message ? <p role="status" className="mt-2 text-sm text-gtext">{message}</p> : null}</Presence>
      <Presence>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</Presence>

      {viewing && api.documentUrl(viewing) && (
        <DocumentViewer title={`${names.get(viewing.id) ?? "Photo"} for ${label}`} imageUrl={api.documentUrl(viewing)!} downloadUrl={api.documentDownloadUrl(viewing)} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
