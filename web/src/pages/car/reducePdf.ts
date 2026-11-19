import { buildPdf, type PicturePage } from "./pdfWriter";

// "Make this PDF smaller" (MIL-07, ADR-0024). Each page is drawn in the browser and saved again as a JPEG picture inside a new PDF.
// Nothing is sent anywhere. The price is that the text can no longer be selected or searched, which the screen says before the owner chooses.

/** A page is drawn so its longest side is this many pixels: sharp enough to read small print on a phone, far smaller than a scan. */
export const PAGE_PIXELS = 1600;
const JPEG_QUALITY = 0.72;
/** A longer PDF would take too long and use too much memory on a phone. */
export const MAX_PAGES = 150;

export interface DrawnPage {
  width: number;
  height: number;
  jpeg: Uint8Array<ArrayBuffer>;
  pixelWidth: number;
  pixelHeight: number;
}
/** An opened PDF. `draw` makes one picture of one page (counting from 0). Replaced in tests, because jsdom cannot draw. */
export interface OpenedPdf {
  pageCount: number;
  draw(index: number): Promise<DrawnPage>;
  close(): void;
}
export type OpenPdf = (file: Blob) => Promise<OpenedPdf>;

export type ReducedPdf = { status: "reduced"; file: Blob; pages: number } | { status: "unreadable" } | { status: "too_long" };

/** Opens a PDF with pdf.js. The PDF code (about a megabyte) loads only here, the first time someone ticks the box. */
export const openWithPdfJs: OpenPdf = async (file) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  return {
    pageCount: pdf.numPages,
    async draw(index) {
      const page = await pdf.getPage(index + 1);
      try {
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: PAGE_PIXELS / Math.max(natural.width, natural.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/jpeg", JPEG_QUALITY));
        const jpeg = new Uint8Array(await blob.arrayBuffer());
        canvas.width = canvas.height = 0; // lets a phone free the picture's memory now
        return { width: natural.width, height: natural.height, jpeg, pixelWidth: Math.max(1, Math.round(viewport.width)), pixelHeight: Math.max(1, Math.round(viewport.height)) };
      } finally {
        page.cleanup();
      }
    },
    close: () => void task.destroy(),
  };
};

/** Makes a smaller copy of a PDF. `onPage` is told which page (from 1) is being drawn. The caller decides whether the copy is smaller. */
export async function reducePdf(file: Blob, onPage: (page: number, of: number) => void = () => {}, open: OpenPdf = openWithPdfJs): Promise<ReducedPdf> {
  let opened: OpenedPdf;
  try {
    opened = await open(file);
  } catch {
    return { status: "unreadable" }; // damaged, or protected with a password
  }
  try {
    if (opened.pageCount < 1) return { status: "unreadable" };
    if (opened.pageCount > MAX_PAGES) return { status: "too_long" };
    const pages: PicturePage[] = [];
    for (let i = 0; i < opened.pageCount; i++) {
      onPage(i + 1, opened.pageCount);
      pages.push(await opened.draw(i));
    }
    return { status: "reduced", file: buildPdf(pages), pages: pages.length };
  } catch {
    return { status: "unreadable" };
  } finally {
    opened.close();
  }
}
