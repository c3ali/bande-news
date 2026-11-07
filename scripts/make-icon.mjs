// Génère desktop/icon.png (512x512) : carré vert arrondi avec une bande blanche
// (style "Bande News") — aucune dépendance externe.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../desktop/icon.png");

const W = 512, H = 512, SS = 3; // supersampling pour un anticrénelage propre

// SDF d'un rectangle arrondi (distance signée)
function sdfRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// couverture antialiasée sur ~1px
const covAt = (d) => clamp01(0.5 - d);

// Couleurs de la charte : --primary-light #2a8a42 -> --primary-dark #0f3d1a
const TOP = [42, 138, 66], BOT = [15, 61, 26];
const gradientAt = (py) => {
  const t = py / H;
  return [
    TOP[0] + (BOT[0] - TOP[0]) * t,
    TOP[1] + (BOT[1] - TOP[1]) * t,
    TOP[2] + (BOT[2] - TOP[2]) * t,
  ];
};

// Formes : fond arrondi + bande blanche centrale (comme un bandeau d'infos)
const bg = { cx: 256, cy: 256, hw: 256, hh: 256, r: 100 };
const band = { cx: 256, cy: 256, hw: 170, hh: 44, r: 22 };   // grande bande blanche
const barTop = { cx: 256, cy: 168, hw: 118, hh: 20, r: 10 };  // barre courte au-dessus
const barBot = { cx: 256, cy: 344, hw: 148, hh: 20, r: 10 };  // barre plus large en dessous

const px = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let aBg = 0, aBand = 0, aBar = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const sxx = x + (sx + 0.5) / SS;
        const syy = y + (sy + 0.5) / SS;
        const bgC = covAt(sdfRoundedRect(sxx, syy, bg.cx, bg.cy, bg.hw, bg.hh, bg.r));
        aBg += bgC;
        if (bgC > 0) {
          aBand += Math.min(bgC, covAt(sdfRoundedRect(sxx, syy, band.cx, band.cy, band.hw, band.hh, band.r)));
          aBar += Math.min(bgC, covAt(sdfRoundedRect(sxx, syy, barTop.cx, barTop.cy, barTop.hw, barTop.hh, barTop.r))
                        + covAt(sdfRoundedRect(sxx, syy, barBot.cx, barBot.cy, barBot.hw, barBot.hh, barBot.r)));
        }
      }
    }
    aBg /= SS * SS; aBand /= SS * SS; aBar = clamp01(aBar / (SS * SS * 2)); // les 2 petites barres se chevauchent jamais

    const blanc = [255, 255, 255];
    // dégradé vertical interpolé sur les sous-pixels aussi (léger, mais cohérent)
    const top = gradientAt(Math.max(0, y - 0.5)), bot = gradientAt(Math.min(H, y + 0.5));
    const grad = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2];

    const mixt = Math.min(1, aBand + aBar);
    const r = grad[0] + (blanc[0] - grad[0]) * mixt;
    const g = grad[1] + (blanc[1] - grad[1]) * mixt;
    const b = grad[2] + (blanc[2] - grad[2]) * mixt;

    const o = (y * W + x) * 4;
    px[o] = Math.round(r); px[o + 1] = Math.round(g); px[o + 2] = Math.round(b);
    px[o + 3] = Math.round(aBg * 255);
  }
}

// ---- Encodage PNG (RGBA, filtre 0) ----
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const raw = Buffer.alloc(H * (1 + W * 4));
let off = 0;
for (let y = 0; y < H; y++) {
  raw[off++] = 0; // filtre none
  px.copy(raw, off, y * W * 4, (y + 1) * W * 4);
  off += W * 4;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`Icône générée : ${OUT} (${png.length} octets)`);
