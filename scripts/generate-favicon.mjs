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
 *   favicon.ico          16/32/48, 32-bit BGRA, supersampled for clean edges
 *   favicon.svg          the same geometry as vector, used by modern browsers
 *   apple-touch-icon.png 180px, full-bleed (iOS applies its own rounded mask)
 *   icon-192.png         PWA install icon, referenced by manifest.webmanifest
 *   icon-512.png         PWA splash icon, referenced by manifest.webmanifest
 *
 * Pure Node - no image libraries (PNG uses the zlib in the standard library).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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

/**
 * Colour a single sub-sample as [r, g, b, a], each 0..255.
 *
 * `rounded` draws the tile's own corner radius (and leaves the corners
 * transparent); the Apple touch icon turns it off because iOS masks the icon
 * itself, and a transparent corner there composites against black. `artScale`
 * shrinks the artwork inside the square so that mask cannot clip it.
 */
function shade(x, y, { bloom, artScale = 1, rounded = true }) {
  if (rounded && roundedSquareSdf(x, y, 1, CORNER) > 0) return [0, 0, 0, 0];

  const ax = x / artScale;
  const ay = y / artScale;
  const d = Math.hypot(ax, ay);
  let rgb = mix(BG_INNER, BG_OUTER, clamp01(d / 1.25));

  // Bloom, so the star reads as light rather than a flat sticker.
  rgb = mix(rgb, ACCENT, bloom * Math.exp(-Math.pow(d / 0.52, 2)));

  // The star body: white core -> accent -> brighter tips.
  if (starField(ax, ay) <= STAR_K) {
    const t = clamp01(d / STAR_R);
    rgb = t < 0.32 ? mix(CORE, ACCENT, t / 0.32) : mix(ACCENT, TIP, (t - 0.32) / 0.68);
  }

  // Tight specular core on top of everything.
  rgb = mix(rgb, CORE, Math.exp(-Math.pow(d / 0.16, 2)) * 0.95);
  return [...rgb, 255];
}

/** Render one size to RGBA, supersampled `ss` times per axis. */
function render(size, { artScale = 1, rounded = true } = {}) {
  // Hinting: a soft glow swallows the star's points at small sizes, so the
  // smaller the icon, the crisper it is drawn.
  const bloom = size <= 16 ? 0.1 : size <= 32 ? 0.22 : 0.34;
  // Large icons need far less supersampling to look smooth, and it keeps the
  // 512px render fast.
  const ss = size >= 256 ? 3 : size >= 128 ? 4 : 8;
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
            { bloom, artScale, rounded },
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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal PNG encoder (8-bit RGBA, no row filtering) for the app icons. */
function writePng(rgba, size, path) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // colour type: truecolour with alpha
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
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
// iOS masks this one itself, so it is full-bleed with the art inset.
writePng(
  render(180, { rounded: false, artScale: 0.84 }),
  180,
  join(OUT_DIR, 'apple-touch-icon.png'),
);
writePng(render(192), 192, join(OUT_DIR, 'icon-192.png'));
writePng(render(512), 512, join(OUT_DIR, 'icon-512.png'));
console.log(
  `✓ favicon.ico (${ICO_SIZES.join('/')}), favicon.svg, apple-touch-icon.png, icon-192/512.png -> ${OUT_DIR}`,
);
