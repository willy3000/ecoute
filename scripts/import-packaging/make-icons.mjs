// Draws the app icons with no image dependencies: a play shape inside a sound
// arc, teal on navy. Writes public/icons/*. Run with: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'icons');
mkdirSync(out, { recursive: true });
const BG = [13, 20, 32];
const FG = [79, 191, 177];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, sum]);
};

/** Signed-distance style coverage, supersampled for smooth edges. */
function coverage(x, y, scale) {
  const px = (x - 0.5) / scale;
  const py = (y - 0.5) / scale;
  // Triangle: play shape.
  const inTri = px > -0.13 && Math.abs(py) < (0.2 - px) * 0.72 && px < 0.2;
  // Arc: right-opening circle band around the triangle.
  const r = Math.hypot(px, py);
  const angle = Math.atan2(py, px);
  const inArc = r > 0.33 && r < 0.39 && Math.abs(angle) > Math.PI * 0.32;
  return inTri || inArc;
}

function png(size, scale) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const S = 3;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) if (coverage((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size, scale)) hit++;
      const a = hit / (S * S);
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(join(out, 'icon-192.png'), png(192, 1));
writeFileSync(join(out, 'icon-512.png'), png(512, 1));
// Maskable icons keep their artwork inside the central safe zone.
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, 0.8));
writeFileSync(
  join(out, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0d1420"/><path d="M37 34 L70 50 L37 66 Z" fill="#4fbfb1"/><path d="M63 21 A36 36 0 1 0 63 79" fill="none" stroke="#4fbfb1" stroke-width="6" stroke-linecap="round"/></svg>`,
);
console.log('icons written');
