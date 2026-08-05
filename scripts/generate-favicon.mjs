/**
 * Generates the NovaOS favicon from the workspace brand palette.
 *
 * The mark is a "nova": a four-pointed star with a white-hot core fading out to
 * the accent blue, sitting on the app's dark rounded tile. Geometry is defined
 * mathematically (a concave superellipse), so the raster and vector outputs are
 * the same shape and the icon can be regenerated deterministically:
 *
 *   node scripts/generate-favicon.mjs
 *
 * Outputs (into apps/web/public):
 *   favicon.ico  16/32/48, 32-bit BGRA, 8x supersampled for clean anti-aliasing
 *   favicon.svg  the same geometry as vector, used by modern browsers
 *
 * Pure Node - no image libraries.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');

// --- Brand palette (mirrors apps/web/src/styles.css) ----------------------
const BG_OUTER = [0x0d, 0x11, 0x17]; // --bg
const BG_INNER = [0x1a, 0x22, 0x30]; // lifted panel tone, for a soft centre
const ACCENT = [0x58, 0xa6, 0xff]; // --accent
const TIP = [0x8e, 0xc8, 0xff]; // brighter at the tips so points survive on dark
const CORE = [0xf2, 0xf8, 0xff]; // white-hot core

// --- Geometry, normalised to [-1, 1] --------------------------------------
const CORNER = 0.42; // tile corner radius
const STAR_P = 0.56; // superellipse exponent; lower = sharper points
const STAR_R = 0.94; // tip reach
const STAR_K = Math.pow(STAR_R, STAR_P);
const ICO_SIZES = [16, 32, 48];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Signed distance to a rounded square; negative inside. */
function roundedSquareSdf(x, y, half, r) {
  const qx = Math.abs(x) - (half - r);
  const qy = Math.abs(y) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Four-pointed superellipse: inside when the field is <= STAR_K. */
const starField = (x, y) => Math.pow(Math.abs(x), STAR_P) + Math.pow(Math.abs(y), STAR_P);

/** Colour a single sub-sample as [r, g, b, a], each 0..255. */
function shade(x, y, bloomStrength) {
  if (roundedSquareSdf(x, y, 1, CORNER) > 0) return [0, 0, 0, 0];

  const d = Math.hypot(x, y);
  let rgb = mix(BG_INNER, BG_OUTER, clamp01(d / 1.25));

  // Bloom, so the star reads as light rather than a flat sticker.
  rgb = mix(rgb, ACCENT, bloomStrength * Math.exp(-Math.pow(d / 0.52, 2)));

  // The star body: white core -> accent -> brighter tips.
  if (starField(x, y) <= STAR_K) {
    const t = clamp01(d / STAR_R);
    rgb = t < 0.32 ? mix(CORE, ACCENT, t / 0.32) : mix(ACCENT, TIP, (t - 0.32) / 0.68);
  }

  // Tight specular core on top of everything.
  rgb = mix(rgb, CORE, Math.exp(-Math.pow(d / 0.16, 2)) * 0.95);
  return [...rgb, 255];
}

/** Render one size to RGBA, supersampled `ss` times per axis. */
function render(size, ss = 8) {
  // Hinting: a soft glow swallows the star's points at small sizes, so the
  // smaller the icon, the crisper it is drawn.
  const bloom = size <= 16 ? 0.1 : size <= 32 ? 0.22 : 0.34;
  const out = new Uint8Array(size * size * 4);
  const n = size * ss;
  const samples = ss * ss;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const [cr, cg, cb, ca] = shade(
            ((px * ss + sx + 0.5) / n) * 2 - 1,
            ((py * ss + sy + 0.5) / n) * 2 - 1,
            bloom,
          );
          const w = ca / 255;
          r += cr * w;
          g += cg * w;
          b += cb * w;
          a += ca;
        }
      }
      const alpha = a / samples;
      const cover = alpha / 255 || 1; // undo the coverage weighting on colour
      const i = (py * size + px) * 4;
      out[i] = Math.round(r / samples / cover);
      out[i + 1] = Math.round(g / samples / cover);
      out[i + 2] = Math.round(b / samples / cover);
      out[i + 3] = Math.round(alpha);
    }
  }
  return out;
}

/** One ICO image: BITMAPINFOHEADER + bottom-up BGRA + (empty) AND mask. */
function dibEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight: XOR image + AND mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // BI_RGB

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const src = size - 1 - y; // ICO scanlines run bottom-up
    for (let x = 0; x < size; x += 1) {
      const s = (src * size + x) * 4;
      const d = (y * size + x) * 4;
      pixels[d] = rgba[s + 2];
      pixels[d + 1] = rgba[s + 1];
      pixels[d + 2] = rgba[s];
      pixels[d + 3] = rgba[s + 3];
    }
  }
  // 32-bit icons carry their own alpha, but the padded AND mask must be present.
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, pixels, mask]);
}

function writeIco(sizes, path) {
  const images = sizes.map((s) => dibEntry(render(s), s));
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width
    e.writeUInt8(size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });
  writeFileSync(path, Buffer.concat([dir, ...entries, ...images]));
}

/** Trace the star outline in polar form so the SVG matches the raster exactly. */
function starPath(cx, cy, scale, steps = 192) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const th = (i / steps) * Math.PI * 2;
    const denom =
      Math.pow(Math.abs(Math.cos(th)), STAR_P) + Math.pow(Math.abs(Math.sin(th)), STAR_P);
    const r = Math.pow(STAR_K / denom, 1 / STAR_P);
    points.push(
      `${(cx + r * Math.cos(th) * scale).toFixed(2)},${(cy + r * Math.sin(th) * scale).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

function writeSvg(path) {
  writeFileSync(
    path,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="NovaOS">
  <defs>
    <radialGradient id="tile" cx="50%" cy="46%" r="72%">
      <stop offset="0%" stop-color="${hex(BG_INNER)}"/>
      <stop offset="100%" stop-color="${hex(BG_OUTER)}"/>
    </radialGradient>
    <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${hex(ACCENT)}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${hex(ACCENT)}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nova" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${hex(CORE)}"/>
      <stop offset="32%" stop-color="${hex(ACCENT)}"/>
      <stop offset="100%" stop-color="${hex(TIP)}"/>
    </radialGradient>
    <!-- Soft specular core; mirrors the gaussian used by the raster renderer. -->
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${hex(CORE)}" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${hex(CORE)}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${hex(CORE)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="${(CORNER * 32).toFixed(1)}" fill="url(#tile)"/>
  <circle cx="32" cy="32" r="26" fill="url(#bloom)"/>
  <path d="${starPath(32, 32, 32)}" fill="url(#nova)"/>
  <circle cx="32" cy="32" r="10" fill="url(#core)"/>
</svg>
`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeIco(ICO_SIZES, join(OUT_DIR, 'favicon.ico'));
writeSvg(join(OUT_DIR, 'favicon.svg'));
console.log(`✓ favicon.ico (${ICO_SIZES.join('/')}) + favicon.svg -> ${OUT_DIR}`);
