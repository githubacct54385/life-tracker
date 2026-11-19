import { useState } from "react";
import type { MaintenanceDocument, MaintenanceRecord } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { DocumentViewer } from "./DocumentViewer";
import { formatSize, isPdf, kindOf } from "./documentFormat";
import { shortDate } from "./readingFormat";

const RECENT = 5;
const actionClass = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline";

/**
 * The newest documents, one tap from the top of the Maintenance page, for showing one to someone at a shop (MIL-07).
 * A photo opens full screen, a PDF opens in the PDF viewer, and either can be saved to the phone.
 */
export function RecentDocuments({ documents, records }: { documents: MaintenanceDocument[]; records: MaintenanceRecord[] | null }) {
  const api = useApi();
  const [viewing, setViewing] = useState<{ document: MaintenanceDocument; title: string } | null>(null);
  if (documents.length === 0 || records === null) return null;
  const newest = [...documents].sort((a, b) => b.id - a.id).slice(0, RECENT);

  return (
    <section aria-labelledby="recent-documents" className="rounded-2xl border border-line bg-card p-4 text-ink">
      <h2 id="recent-documents" className="font-bold">
        Recent documents
      </h2>
      <ul className="mt-2">
        {newest.map((doc) => {
          const record = records.find((r) => r.id === doc.recordId);
          const service = record ? `${record.services.join(", ")} on ${shortDate(record.date)}` : "A service";
          const url = api.documentUrl(doc);
          const downloadUrl = api.documentDownloadUrl(doc);
          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-3 border-b border-line py-2 last:border-b-0">
              <div className="min-w-0">
                <p className="font-bold break-words">{service}</p>
                <p className="text-sm text-muted">
                  {kindOf(doc)} &middot; {formatSize(doc.bytes)}
                </p>
              </div>
              <span className="flex flex-wrap">
                {url !== undefined && isPdf(doc) && (
                  <a className={actionClass} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open PDF: ${service}`}>
                    Open
                  </a>
                )}
                {url !== undefined && !isPdf(doc) && (
                  <button type="button" className={actionClass} aria-label={`View photo: ${service}`} onClick={() => setViewing({ document: doc, title: `Photo for ${service}` })}>
                    View
                  </button>
                )}
                {downloadUrl !== undefined && (
                  <a className={actionClass} href={downloadUrl} download aria-label={`Download ${kindOf(doc).toLowerCase()}: ${service}`}>
                    Download
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {documents.length > RECENT && <p className="mt-2 text-sm text-muted">Showing the {RECENT} newest. The rest are under their services.</p>}
      {viewing && api.documentUrl(viewing.document) && (
        <DocumentViewer title={viewing.title} imageUrl={api.documentUrl(viewing.document)!} downloadUrl={api.documentDownloadUrl(viewing.document)} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
