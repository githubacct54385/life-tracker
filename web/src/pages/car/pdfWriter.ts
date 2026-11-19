// Writes a plain PDF whose pages are JPEG pictures (MIL-07, "Make this PDF smaller"). By hand, because this is all it needs:
// one picture per page, drawn to fill it. Every PDF viewer, including the iPhone's, opens a file like this.

export interface PicturePage {
  /** The page's size in PDF points (1/72 inch), so the smaller PDF prints at the size of the original. */
  width: number;
  height: number;
  /** The JPEG file's bytes and its size in pixels. */
  jpeg: Uint8Array<ArrayBuffer>;
  pixelWidth: number;
  pixelHeight: number;
}

const encoder = new TextEncoder();
const num = (n: number) => String(Math.round(n * 100) / 100);

export function buildPdf(pages: PicturePage[]): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = []; // offsets[n] is where object n starts
  let length = 0;
  const push = (bytes: Uint8Array<ArrayBuffer>) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const text = (s: string) => push(encoder.encode(s));
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    text(`${n} 0 obj\n`);
    body();
    text("endobj\n");
  };

  text("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // a comment of high bytes: tells tools this is a binary file

  // Objects: 1 catalog, 2 page list, then page (3+3i), its drawing instruction (4+3i) and its picture (5+3i).
  object(1, () => text("<< /Type /Catalog /Pages 2 0 R >>\n"));
  object(2, () => text(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] >>\n`));
  pages.forEach((page, i) => {
    const first = 3 + 3 * i;
    const draw = `q ${num(page.width)} 0 0 ${num(page.height)} 0 0 cm /Im0 Do Q\n`;
    object(first, () => text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /XObject << /Im0 ${first + 2} 0 R >> >> /Contents ${first + 1} 0 R >>\n`));
    object(first + 1, () => text(`<< /Length ${draw.length} >>\nstream\n${draw}endstream\n`));
    object(first + 2, () => {
      text(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
      push(page.jpeg);
      text("\nendstream\n");
    });
  });

  const count = 3 + 3 * pages.length; // objects 1..count-1, plus the free entry 0
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  text(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(parts, { type: "application/pdf" });
}
