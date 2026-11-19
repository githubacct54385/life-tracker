import { sniffDocumentType } from "@life-tracker/shared";
import { describe, expect, it } from "vitest";
import { buildPdf, type PicturePage } from "./pdfWriter";

// Synthetic "pictures": the JPEG start-of-image bytes then filler. The writer never decodes them.
const page = (n: number, bytes = 40): PicturePage => ({ width: 612, height: 792, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(bytes).fill(n)]), pixelWidth: 1239, pixelHeight: 1600 });
const read = async (pages: PicturePage[]) => new Uint8Array(await buildPdf(pages).arrayBuffer());
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("buildPdf", () => {
  it("[AC-MIL-07.17] writes a file the server accepts as a PDF, with one page object per picture", async () => {
    const bytes = await read([page(1), page(2), page(3)]);
    expect(sniffDocumentType(bytes)).toBe("application/pdf");
    const text = latin1(bytes);
    expect(text).toMatch(/\/Type \/Pages \/Count 3 /);
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("[AC-MIL-07.17] has a table of contents (xref) whose every entry points at its own object", async () => {
    const text = latin1(await read([page(1), page(2)]));
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const [, size] = /xref\n0 (\d+)\n/.exec(text.slice(start))!.map(Number) as [unknown, number];
    expect(size).toBe(3 + 3 * 2);
    const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(size - 1);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("[AC-MIL-07.17] stores each picture's bytes whole and declares the right length", async () => {
    const jpeg = page(7, 1000).jpeg;
    const bytes = await read([page(7, 1000)]);
    const text = latin1(bytes);
    expect(text).toContain(`/Length ${jpeg.length} >>\nstream\n`);
    expect(text).toContain(latin1(jpeg));
  });

  it("[AC-MIL-07.17] keeps the size of each page, so it prints as large as the original", async () => {
    const text = latin1(await read([{ ...page(1), width: 595.28, height: 841.89 }]));
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
  });
});
