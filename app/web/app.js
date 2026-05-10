import init, { process_image } from './pkg/spritefusion_pixel_snapper.js';

const els = {
  file: document.getElementById('file'),
  drop: document.getElementById('drop'),
  k: document.getElementById('k'),
  kVal: document.getElementById('k-val'),
  pixelSize: document.getElementById('pixel-size'),
  chromaInputs: document.querySelectorAll('input[name=chroma]'),
  chromaColor: document.getElementById('chroma-color'),
  trim: document.getElementById('trim'),
  tolerance: document.getElementById('tolerance'),
  toleranceVal: document.getElementById('tolerance-val'),
  run: document.getElementById('run'),
  download: document.getElementById('download'),
  sourceImg: document.getElementById('source-img'),
  resultCanvas: document.getElementById('result-canvas'),
  resultBox: document.getElementById('result-box'),
  previewScale: document.getElementById('preview-scale'),
  meta: document.getElementById('meta'),
  status: document.getElementById('status'),
};

let sourceBytes = null;
let sourceUrl = null;
let resultBlobUrl = null;
let resultName = 'snapped.png';

await init();

// ---------- snap.py port ----------

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

  const counts = []; // [[r,g,b], count]
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
  const [br, bgC, bb] = bg;
  for (let i = 0; i < rgba.length; i += 4) {
    if (
      Math.abs(rgba[i] - br) <= tolerance &&
      Math.abs(rgba[i + 1] - bgC) <= tolerance &&
      Math.abs(rgba[i + 2] - bb) <= tolerance
    ) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
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

  // PIL getbbox returns half-open (x0, y0, x1+1, y1+1); crop adds +1 pad each side
  const X0 = Math.max(0, x0 - 1);
  const Y0 = Math.max(0, y0 - 1);
  const X1 = Math.min(w, x1 + 2);
  const Y1 = Math.min(h, y1 + 2);
  const nw = X1 - X0;
  const nh = Y1 - Y0;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const srcStart = ((Y0 + y) * w + X0) * 4;
    out.set(rgba.subarray(srcStart, srcStart + nw * 4), y * nw * 4);
  }
  return { rgba: out, w: nw, h: nh };
}

// ---------- helpers ----------

function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function decodePngToImageData(bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

function imageDataToCanvas(rgba, w, h, target) {
  target.width = w;
  target.height = h;
  const ctx = target.getContext('2d');
  const id = new ImageData(rgba, w, h);
  ctx.putImageData(id, 0, 0);
}

function updateResultPreviewScale(w, h) {
  if (!w || !h) {
    els.previewScale.textContent = '';
    return;
  }

  const availableW = Math.max(240, els.resultBox.clientWidth - 24);
  const availableH = Math.max(240, Math.min(window.innerHeight * 0.62, 720));
  const scale = Math.max(
    1,
    Math.min(32, Math.floor(Math.min(availableW / w, availableH / h)))
  );

  els.resultCanvas.style.width = `${w * scale}px`;
  els.resultCanvas.style.height = `${h * scale}px`;
  els.previewScale.textContent = `preview x${scale}`;
}

function canvasToPngBlob(canvas) {
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

function countAlpha(rgba) {
  let opaque = 0, transparent = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) transparent++;
    else opaque++;
  }
  return { opaque, transparent };
}

function getChromaMode() {
  return document.querySelector('input[name=chroma]:checked').value;
}

function setStatus(msg) { els.status.textContent = msg; }
function setMeta(html) { els.meta.innerHTML = html; }

// ---------- pipeline ----------

async function loadFile(file) {
  resultName = file.name.replace(/\.[^.]+$/, '') + '_pixel.png';
  const buf = await file.arrayBuffer();
  sourceBytes = new Uint8Array(buf);
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(new Blob([sourceBytes]));
  els.sourceImg.src = sourceUrl;
  els.run.disabled = false;
  setStatus('loaded — click Snap');
  setMeta('');
  await runPipeline();
}

async function runPipeline() {
  if (!sourceBytes) return;
  els.run.disabled = true;
  els.download.disabled = true;
  setStatus('snapping…');

  const k = parseInt(els.k.value, 10);
  const psRaw = els.pixelSize.value.trim();
  const ps = psRaw ? parseInt(psRaw, 10) : null;
  const chromaMode = getChromaMode();
  const tolerance = parseInt(els.tolerance.value, 10);
  const trim = els.trim.checked;

  let outBytes;
  const t0 = performance.now();
  try {
    outBytes = process_image(sourceBytes, k, ps);
  } catch (e) {
    setStatus('snap error: ' + e);
    els.run.disabled = false;
    return;
  }
  const tSnap = performance.now() - t0;

  const snapped = await decodePngToImageData(outBytes);
  let { data: rgba, width: w, height: h } = snapped;
  // ImageData.data is Uint8ClampedArray — mutable, but we need our own copy for trim
  rgba = new Uint8ClampedArray(rgba);

  // chroma
  let bg = null;
  if (chromaMode === 'auto') bg = detectBgColor(rgba, w, h);
  else if (chromaMode === 'force') bg = hexToRgb(els.chromaColor.value);

  let chromaInfo;
  if (bg === null) {
    chromaInfo = 'skipped';
  } else {
    chromaKey(rgba, bg, tolerance);
    chromaInfo = `keyed bg=rgb(${bg.join(',')}) tol=${tolerance}`;
  }

  // trim (only if chroma actually applied, matches snap.py)
  let beforeSize = [w, h];
  if (trim && bg !== null) {
    const trimmed = alphaTrim(rgba, w, h);
    rgba = trimmed.rgba; w = trimmed.w; h = trimmed.h;
  }

  // render
  imageDataToCanvas(rgba, w, h, els.resultCanvas);
  updateResultPreviewScale(w, h);

  // download blob
  const blob = await canvasToPngBlob(els.resultCanvas);
  if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
  resultBlobUrl = URL.createObjectURL(blob);
  els.download.disabled = false;

  // meta
  const counts = countAlpha(rgba);
  const trimNote = (trim && bg !== null && (beforeSize[0] !== w || beforeSize[1] !== h))
    ? ` → trimmed from ${beforeSize[0]}×${beforeSize[1]}`
    : '';
  const psNote = ps ? `${ps}px (override)` : 'auto';
  setMeta(
    `<strong>snapped:</strong> ${snapped.width}×${snapped.height}` +
    ` · <strong>output:</strong> ${w}×${h}${trimNote}` +
    ` · <strong>pixel_size:</strong> ${psNote}` +
    ` · <strong>chroma:</strong> ${chromaInfo}` +
    ` · <strong>α:</strong> ${counts.opaque} opaque / ${counts.transparent} transparent` +
    ` · <strong>snap:</strong> ${tSnap.toFixed(0)} ms`
  );

  // if auto chroma found a bg, reflect it in the picker for visibility
  if (chromaMode === 'auto' && bg) els.chromaColor.value = rgbToHex(bg);

  setStatus('done');
  els.run.disabled = false;
}

// ---------- wiring ----------

els.k.addEventListener('input', () => { els.kVal.value = els.k.value; });
els.tolerance.addEventListener('input', () => { els.toleranceVal.value = els.tolerance.value; });

for (const r of els.chromaInputs) {
  r.addEventListener('change', () => {
    els.chromaColor.disabled = getChromaMode() !== 'force';
  });
}

let debounceTimer = null;
function scheduleRun() {
  if (!sourceBytes) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runPipeline, 250);
}
for (const id of ['k', 'pixelSize', 'tolerance']) els[id].addEventListener('change', scheduleRun);
els.trim.addEventListener('change', scheduleRun);
els.chromaColor.addEventListener('change', scheduleRun);
for (const r of els.chromaInputs) r.addEventListener('change', scheduleRun);

window.addEventListener('resize', () => {
  updateResultPreviewScale(els.resultCanvas.width, els.resultCanvas.height);
});

els.run.addEventListener('click', runPipeline);

els.download.addEventListener('click', () => {
  if (!resultBlobUrl) return;
  const a = document.createElement('a');
  a.href = resultBlobUrl;
  a.download = resultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

els.file.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

['dragenter', 'dragover'].forEach(ev =>
  els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.add('hover'); })
);
['dragleave', 'drop'].forEach(ev =>
  els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.remove('hover'); })
);
els.drop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

setStatus('ready — drop an image');
