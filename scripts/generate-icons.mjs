// Generates the app icons as plain PNG files, with no dependencies and no personal content.
// Run: node scripts/generate-icons.mjs   (output: web/public/icons). The files are committed; rerun only to change the design.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [0x2f, 0x6b, 0x4f]; // --g700
const FG = [0xe3, 0xf1, 0xe8]; // --g100

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// A light ring with a dot in the middle, on the brand green. `scale` shrinks the mark to keep it inside the maskable safe zone.
const mark = (scale) => (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5) / scale;
  return (d < 0.3 && d > 0.2) || d < 0.1 ? FG : BG;
};
const out = new URL("../web/public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("icon-192.png", out), png(192, mark(1)));
writeFileSync(new URL("icon-512.png", out), png(512, mark(1)));
writeFileSync(new URL("icon-maskable-512.png", out), png(512, mark(0.8)));
writeFileSync(new URL("apple-touch-icon.png", out), png(180, mark(0.9)));
