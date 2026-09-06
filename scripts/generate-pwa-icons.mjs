// Generates placeholder PWA app icons (192x192 and 512x512) into
// public/icons/ with zero dependencies — a hand-rolled PNG encoder
// (8-bit RGB, no filtering, zlib DEFLATE, manual CRC-32).
//
// The placeholder is the app's primary brand colour (#1A4F8A, from
// globals.css --primary / company.config.ts) with a centred white disc,
// so the install prompt shows a real icon, not a broken-image glyph.
// Replace public/icons/icon-192.png and icon-512.png with the real AMSU
// artwork whenever it's ready — the manifest references these exact paths.
//
//   node scripts/generate-pwa-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, colourAt) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: 2 = truecolour (RGB)
  // ihdr[10..12] = compression / filter / interlace = 0

  const stride = size * 3 + 1; // +1 filter byte per scanline
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type 0 (None)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = colourAt(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const PRIMARY = [0x1a, 0x4f, 0x8a];
const WHITE = [0xff, 0xff, 0xff];

function iconPainter(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.26;
  const r2 = r * r;
  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= r2 ? WHITE : PRIMARY;
  };
}

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, iconPainter(size)));
  console.log(`wrote public/icons/icon-${size}.png`);
}
