import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPES, sniffDocumentType } from "./maintenanceDocuments.js";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("sniffDocumentType", () => {
  it("[AC-MIL-07.3] recognises JPEG, PNG, WebP and PDF from their first bytes", () => {
    expect(sniffDocumentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]))).toBe("image/jpeg");
    expect(sniffDocumentType(Uint8Array.from([...PNG, 0, 0]))).toBe("image/png");
    expect(sniffDocumentType(Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffDocumentType(Uint8Array.from(ascii("%PDF-1.4\n%")))).toBe("application/pdf");
  });

  it("[AC-MIL-07.3] refuses other RIFF files, text, scripts, SVG, GIF and empty or truncated input", () => {
    const refused = [
      [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVEfmt ")],
      ascii("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
      ascii("<html><body>hi</body></html>"),
      ascii("GIF89a"),
      [0xff, 0xd8],
      PNG.slice(0, 5),
      ascii("RIFF"),
      ascii("%PDF"),
      [],
    ];
    for (const bytes of refused) expect(sniffDocumentType(Uint8Array.from(bytes))).toBeUndefined();
  });

  it("[AC-MIL-07.3] the answer depends only on the bytes: any input gives one of the four types or nothing", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
      const type = sniffDocumentType(bytes);
      expect(type === undefined || (DOCUMENT_TYPES as readonly string[]).includes(type)).toBe(true);
    }));
  });

  it("[AC-MIL-07.3] a file starting with the PNG signature is a PNG whatever follows", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), (tail) => sniffDocumentType(Uint8Array.from([...PNG, ...tail])) === "image/png"));
  });
});
