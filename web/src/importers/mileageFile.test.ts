import writeXlsxFile from "write-excel-file/universal";
import { describe, expect, it } from "vitest";
import { declaredUncompressedBytes, MAX_FILE_BYTES, readMileageFile } from "./mileageFile";

// Fixtures are generated here, never stored (AGENTS rule 3). Values are invented.
async function xlsx(data: unknown[][]): Promise<Blob> {
  const write = writeXlsxFile as unknown as (rows: unknown[][]) => { toBlob(): Promise<Blob> };
  return new Blob([await write(data).toBlob()]);
}
const named = (blob: Blob, name: string) => Object.assign(blob, { name });

describe("readMileageFile", () => {
  it("[AC-MIL-04.1] accepts an .xlsx with Date and Start Miles columns, including real date cells", async () => {
    const file = named(
      await xlsx([
        [{ value: "Date" }, { value: "Start Miles (Friday)" }, { value: "Miles Driven" }],
        [{ value: new Date(Date.UTC(2026, 0, 2)), format: "mm/dd/yyyy" }, { value: 1000 }, { value: 120 }],
        [{ value: "2026-01-09" }, { value: 1120 }, { value: 30 }],
      ]),
      "history.xlsx",
    );
    const result = await readMileageFile(file);
    expect(result.problem).toBeUndefined();
    expect(result.rows).toEqual([
      { rowNumber: 2, date: "2026-01-02", miles: 1000, sheetMilesDriven: 120 },
      { rowNumber: 3, date: "2026-01-09", miles: 1120, sheetMilesDriven: 30 },
    ]);
  });

  it("[AC-MIL-04.1] accepts a CSV", async () => {
    const file = named(new Blob(["Date,Start Miles,Miles Driven\n1/2/2026,1000,120\n"]), "history.csv");
    expect((await readMileageFile(file)).rows).toEqual([{ rowNumber: 2, date: "2026-01-02", miles: 1000, sheetMilesDriven: 120 }]);
  });

  it("[AC-MIL-04.1] refuses other file types, unreadable .xlsx files and files over the size limit", async () => {
    expect((await readMileageFile(named(new Blob(["x"]), "photo.png"))).problem).toBe("unsupported_file");
    expect((await readMileageFile(named(new Blob(["not a zip"]), "broken.xlsx"))).problem).toBe("unreadable");
    expect((await readMileageFile(named(new Blob([new Uint8Array(MAX_FILE_BYTES + 1)]), "huge.csv"))).problem).toBe("too_big");
  });

  it("[AC-MIL-04.5] reads the file in the browser only: no network call is made", async () => {
    const calls: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => (calls.push(args), Promise.reject(new Error("no network")))) as typeof fetch;
    try {
      await readMileageFile(named(new Blob(["Date,Start Miles\n1/2/2026,1000\n"]), "history.csv"));
      await readMileageFile(named(await xlsx([[{ value: "Date" }, { value: "Start Miles" }]]), "history.xlsx"));
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toEqual([]);
  });
});

describe("declaredUncompressedBytes", () => {
  it("[AC-MIL-04.1] is undefined for something that is not a zip", () => {
    expect(declaredUncompressedBytes(new ArrayBuffer(64))).toBeUndefined();
  });
});
