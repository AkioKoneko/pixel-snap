// Acceptance test: WASM + JS port of chroma+trim must match snap.py output byte-for-byte (RGBA).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import init, { process_image } from '../web/pkg/spritefusion_pixel_snapper.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const srcPath = path.join(root, 'test-input', 'berries_source.png');
const bonePilePath = path.join(root, 'test-input', 'desert_bone_pile_01_source.png');
const wasmPath = path.join(root, 'web', 'pkg', 'spritefusion_pixel_snapper_bg.wasm');
const expected = {
  w: 39,
  h: 36,
  rgbaSha256: '23a76b04be7c1a0cd93d595dca2f791d4dc9f0f7c6a6c10d58a02fa3afb38ca1',
};

await init({ module_or_path: readFileSync(wasmPath) });

// --- snap.py port (mirror of web/app.js) ---

function detectBgColor(rgba, w, h) {
  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const close = (a, b) =>
    Math.abs(a[0] - b[0]) <= 20 &&
    Math.abs(a[1] - b[1]) <= 20 &&
    Math.abs(a[2] - b[2]) <= 20;
  const counts = [];
  for (const c of corners) {
    let merged = false;
    for (const e of counts) {
      if (close(c, e[0])) { e[1]++; merged = true; break; }
    }
    if (!merged) counts.push([c, 1]);
  }
  counts.sort((a, b) => b[1] - a[1]);
  if (counts.length && counts[0][1] >= 3) return counts[0][0];
  return null;
}

function chromaKey(rgba, bg, tolerance) {
  const [br, bg_, bb] = bg;
  for (let i = 0; i < rgba.length; i += 4) {
    if (
      Math.abs(rgba[i] - br) <= tolerance &&
      Math.abs(rgba[i + 1] - bg_) <= tolerance &&
      Math.abs(rgba[i + 2] - bb) <= tolerance
    ) {
      rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
    }
  }
}

function alphaTrim(rgba, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { rgba, w, h };
  const X0 = Math.max(0, x0 - 1);
  const Y0 = Math.max(0, y0 - 1);
  const X1 = Math.min(w, x1 + 2);
  const Y1 = Math.min(h, y1 + 2);
  const nw = X1 - X0, nh = Y1 - Y0;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const srcStart = ((Y0 + y) * w + X0) * 4;
    out.set(rgba.subarray(srcStart, srcStart + nw * 4), y * nw * 4);
  }
  return { rgba: out, w: nw, h: nh };
}

function decodePng(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { rgba: new Uint8Array(png.data), w: png.width, h: png.height };
}

function countVisiblePinkish(rgba) {
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    if (rgba[i] > 120 && rgba[i + 1] < 80 && rgba[i + 2] > 100) count++;
  }
  return count;
}

// --- run pipeline ---

const srcBytes = readFileSync(srcPath);
const snappedBytes = process_image(srcBytes, 16, undefined);
const snapped = decodePng(snappedBytes);

const bg = detectBgColor(snapped.rgba, snapped.w, snapped.h);
console.log(`snapped: ${snapped.w}x${snapped.h}`);
console.log(`detected bg: ${bg ? `rgb(${bg.join(',')})` : 'null'}`);

if (!bg) { console.error('FAIL: no bg detected'); process.exit(1); }

chromaKey(snapped.rgba, bg, 30);
const trimmed = alphaTrim(snapped.rgba, snapped.w, snapped.h);
console.log(`trimmed: ${trimmed.w}x${trimmed.h}`);

console.log(`expected: ${expected.w}x${expected.h}`);

if (trimmed.w !== expected.w || trimmed.h !== expected.h) {
  console.error(`FAIL: dimension mismatch (got ${trimmed.w}x${trimmed.h}, expected ${expected.w}x${expected.h})`);
  process.exit(1);
}

const total = trimmed.w * trimmed.h;
const actualHash = createHash('sha256').update(trimmed.rgba).digest('hex');
if (actualHash === expected.rgbaSha256) {
  console.log(`PASS: ${total} pixels identical`);
} else {
  console.error(`FAIL: RGBA hash mismatch (got ${actualHash}, expected ${expected.rgbaSha256})`);
  process.exit(1);
}

// Regression fixture: tolerance above the old web max is needed to remove magenta remnants.
const boneBytes = readFileSync(bonePilePath);
const boneSnapped = decodePng(process_image(boneBytes, 32, undefined));
const boneBg = detectBgColor(boneSnapped.rgba, boneSnapped.w, boneSnapped.h);
if (!boneBg) { console.error('FAIL: no bg detected for bone pile'); process.exit(1); }
chromaKey(boneSnapped.rgba, boneBg, 140);
const pinkish = countVisiblePinkish(boneSnapped.rgba);
console.log(`bone pile visible pinkish pixels at tol=140: ${pinkish}`);
if (pinkish !== 0) {
  console.error(`FAIL: expected no visible pinkish pixels, got ${pinkish}`);
  process.exit(1);
}

process.exit(0);
