import { describe, expect, it, vi } from "vitest";
import { MAX_PAGES, reducePdf, type DrawnPage, type OpenPdf } from "./reducePdf";

const drawn = (n: number): DrawnPage => ({ width: 612, height: 792, jpeg: new Uint8Array([0xff, 0xd8, 0xff, n]), pixelWidth: 100, pixelHeight: 130 });
const opener = (pageCount: number, draw = async (i: number) => drawn(i)): { open: OpenPdf; close: ReturnType<typeof vi.fn> } => {
  const close = vi.fn();
  return { open: async () => ({ pageCount, draw, close }), close };
};
const input = new Blob(["%PDF-1.7 synthetic"], { type: "application/pdf" });

describe("reducePdf", () => {
  it("[AC-MIL-07.14][AC-MIL-07.17] draws every page in order, reports progress, and returns a PDF with the same number of pages", async () => {
    const { open, close } = opener(3);
    const progress: Array<[number, number]> = [];
    const result = await reducePdf(input, (page, of) => progress.push([page, of]), open);
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(result.status).toBe("reduced");
    if (result.status !== "reduced") return;
    expect(result.pages).toBe(3);
    expect(result.file.type).toBe("application/pdf");
    expect((await result.file.text()).match(/\/Type \/Page /g)).toHaveLength(3);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.15] says unreadable when the PDF cannot be opened (damaged or password-protected)", async () => {
    const open: OpenPdf = async () => {
      throw new Error("PasswordException");
    };
    expect(await reducePdf(input, () => {}, open)).toEqual({ status: "unreadable" });
  });

  it("[AC-MIL-07.15] says unreadable, and still closes the file, when one page cannot be drawn", async () => {
    const { open, close } = opener(3, async (i) => {
      if (i === 1) throw new Error("bad page");
      return drawn(i);
    });
    expect(await reducePdf(input, () => {}, open)).toEqual({ status: "unreadable" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.15] refuses a PDF with more pages than a phone can handle, and draws none", async () => {
    const draw = vi.fn(async (i: number) => drawn(i));
    const { open } = opener(MAX_PAGES + 1, draw);
    expect(await reducePdf(input, () => {}, open)).toEqual({ status: "too_long" });
    expect(draw).not.toHaveBeenCalled();
  });

  it("[AC-MIL-07.15] treats a PDF with no pages as unreadable", async () => {
    expect(await reducePdf(input, () => {}, opener(0).open)).toEqual({ status: "unreadable" });
  });
});
