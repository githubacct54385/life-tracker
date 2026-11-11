import { useState, type ChangeEvent } from "react";
import { previewImportRows, type ImportMileageResult, type ImportPreviewRow } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { readMileageFile } from "../../importers/mileageFile";
import type { RowError } from "../../importers/mileageGrid";
import { Page } from "../Page";
import { formatMiles, shortDate } from "./readingFormat";

const primaryButton = "rounded-xl bg-g700 px-4 py-3 font-bold text-white disabled:opacity-40";

const PROBLEMS: Record<string, string> = {
  missing_columns: "The file needs a Date column and a Start Miles column in a header row.",
  too_many_rows: "That file has too many rows to import at once (limit 5,000).",
  too_big: "That file is too big (limit 5 MB).",
  unsupported_file: "Choose an Excel (.xlsx) or CSV (.csv) file.",
  unreadable: "That file could not be read.",
};

const errorText = (error: RowError) => `Row ${error.rowNumber}: ${error.reason === "bad_date" ? "the date was not understood" : "Start Miles is not a whole number"}.`;

interface Preview {
  rows: ImportPreviewRow[];
  errors: RowError[];
}

/** Car > Import history (MIL-04). The file is read here in the browser and dropped; only the parsed rows are sent (AC-MIL-04.5). */
export function ImportMileagePage() {
  const api = useApi();
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportMileageResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setResult(null);
    setFailed(false);
    setProblem(null);
    if (!file) return;
    const parsed = await readMileageFile(file);
    if (parsed.problem) return setProblem(PROBLEMS[parsed.problem] ?? PROBLEMS.unreadable!);
    if (parsed.rows.length === 0) return setProblem("No readings were found in that file.");
    setPreview({ rows: previewImportRows(parsed.rows), errors: parsed.errors });
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setFailed(false);
    try {
      setResult(await api.importReadings(preview.rows.map(({ date, miles }) => ({ date, miles }))));
      setPreview(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const flagged = preview?.rows.filter((row) => row.flagged).length ?? 0;

  return (
    <Page title="Import history">
      <div className="space-y-4 text-ink">
        <p className="text-muted">
          Choose your mileage spreadsheet (.xlsx or .csv) with Date and Start Miles columns. Miles driven is worked out again here, not copied from the file. The file stays on this device and is not saved.
        </p>
        <label className="block font-bold" htmlFor="mileage-file">
          Spreadsheet file
        </label>
        <input id="mileage-file" type="file" accept=".xlsx,.csv" className="block w-full text-ink" onChange={(e) => void choose(e)} />
        {problem && <p role="alert">{problem}</p>}

        {preview && (
          <section aria-labelledby="import-preview" className="space-y-3 rounded-2xl border border-line bg-card p-4">
            <h2 id="import-preview" className="font-bold">
              Preview
            </h2>
            <p>
              {preview.rows.length} readings found.{" "}
              {flagged > 0 ? `${flagged} ${flagged === 1 ? "row differs" : "rows differ"} from the sheet's Miles Driven.` : "Every Miles Driven value matches the sheet."} Readings already saved are skipped.
            </p>
            {preview.errors.length > 0 && (
              <div role="alert" className="rounded-xl border border-line bg-sunk p-3">
                <p className="font-bold">{preview.errors.length} rows will be left out:</p>
                <ul className="list-disc pl-5">
                  {preview.errors.slice(0, 20).map((error) => (
                    <li key={error.rowNumber}>{errorText(error)}</li>
                  ))}
                </ul>
                {preview.errors.length > 20 && <p>…and {preview.errors.length - 20} more.</p>}
              </div>
            )}
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-sm text-muted">
                    <th className="py-1 pr-2 font-normal">Date</th>
                    <th className="py-1 pr-2 font-normal">Start miles</th>
                    <th className="py-1 font-normal">Miles driven</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.flagged ? "bg-sunk" : undefined} data-flagged={row.flagged || undefined}>
                      <td className="py-1 pr-2">{shortDate(row.date)}</td>
                      <td className="py-1 pr-2">{formatMiles(row.miles)}</td>
                      <td className="py-1">
                        {row.milesDriven === undefined ? "–" : formatMiles(row.milesDriven)}
                        {row.flagged && <span className="block text-sm font-bold">Check: sheet says {formatMiles(row.sheetMilesDriven!)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className={primaryButton} disabled={busy} onClick={() => void commit()}>
              Import {preview.rows.length} readings
            </button>
            {failed && <p role="alert">That did not work. Try again.</p>}
          </section>
        )}

        {result && (
          <p role="status" className="text-g700">
            Imported {result.imported} readings. {result.duplicates} were already saved and skipped.
          </p>
        )}
      </div>
    </Page>
  );
}
