import init, { process_image } from './pkg/spritefusion_pixel_snapper.js';

const els = {
  file: document.getElementById('file'),
  drop: document.getElementById('drop'),
  k: document.getElementById('k'),
  kVal: document.getElementById('k-val'),
  pixelSize: document.getElementById('pixel-size'),
  finalWidth: document.getElementById('final-width'),
  finalHeight: document.getElementById('final-height'),
  finalSizeButtons: document.querySelectorAll('[data-final-size]'),
  clearFinalSize: document.getElementById('clear-final-size'),
  preserveAspect: document.getElementById('preserve-aspect'),
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
let lastNativeSize = null;
let finalSizeMode = 'native';

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

function resizeImageDataNearest(rgba, w, h, targetW, targetH) {
  if (targetW === w && targetH === h) return { rgba, w, h };

  const out = new Uint8ClampedArray(targetW * targetH * 4);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(h - 1, Math.floor(y * h / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(w - 1, Math.floor(x * w / targetW));
      const src = (sy * w + sx) * 4;
      const dst = (y * targetW + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return { rgba: out, w: targetW, h: targetH };
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

function sizeText(size) {
  return size ? `${size.w}x${size.h}` : 'native';
}

function aspectHeight(width, baseSize) {
  return Math.max(1, Math.round(width * baseSize.h / baseSize.w));
}

function aspectWidth(height, baseSize) {
  return Math.max(1, Math.round(height * baseSize.w / baseSize.h));
}

function setFinalFields(w, h) {
  els.finalWidth.value = w ? String(w) : '';
  els.finalHeight.value = h ? String(h) : '';
}

function setNativeSize(size) {
  lastNativeSize = size;
  const text = sizeText(size);
  els.finalWidth.placeholder = size ? String(size.w) : 'native';
  els.finalHeight.placeholder = size ? String(size.h) : 'native';
  els.clearFinalSize.title = size ? `Use native output size: ${text}` : 'Use native output size';
  if (size && finalSizeMode === 'native') setFinalFields(size.w, size.h);
}

function syncFinalAspectFrom(axis) {
  if (!els.preserveAspect.checked || !lastNativeSize) return;
  if (axis === 'w') {
    const w = parseInt(els.finalWidth.value, 10);
    if (Number.isFinite(w) && w > 0) els.finalHeight.value = String(aspectHeight(w, lastNativeSize));
  } else {
    const h = parseInt(els.finalHeight.value, 10);
    if (Number.isFinite(h) && h > 0) els.finalWidth.value = String(aspectWidth(h, lastNativeSize));
  }
}

function getFinalSize(baseSize = lastNativeSize) {
  if (finalSizeMode === 'native') return null;
  const wRaw = els.finalWidth.value.trim();
  const hRaw = els.finalHeight.value.trim();
  if (!wRaw && !hRaw) return null;

  const w = wRaw ? parseInt(wRaw, 10) : null;
  const h = hRaw ? parseInt(hRaw, 10) : null;
  if ((wRaw && (!Number.isFinite(w) || w < 1)) || (hRaw && (!Number.isFinite(h) || h < 1))) {
    throw new Error('final size must be positive');
  }
  if (els.preserveAspect.checked && baseSize) {
    if (w) return { w, h: aspectHeight(w, baseSize) };
    if (h) return { w: aspectWidth(h, baseSize), h };
  }
  if (w && h) return { w, h };
  if (w) return { w, h: w };
  return { w: h, h };
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
  els.drop.classList.add('has-image');
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

  const preResizeSize = [w, h];
  setNativeSize({ w, h });
  let finalSize;
  try {
    finalSize = getFinalSize({ w, h });
  } catch (e) {
    setStatus(String(e.message || e));
    els.run.disabled = false;
    return;
  }
  if (finalSize && els.preserveAspect.checked) setFinalFields(finalSize.w, finalSize.h);
  if (finalSize) {
    const resized = resizeImageDataNearest(rgba, w, h, finalSize.w, finalSize.h);
    rgba = resized.rgba; w = resized.w; h = resized.h;
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
  const trimNote = (trim && bg !== null && (beforeSize[0] !== preResizeSize[0] || beforeSize[1] !== preResizeSize[1]))
    ? ` → trimmed from ${beforeSize[0]}×${beforeSize[1]}`
    : '';
  const resizeNote = finalSize && (preResizeSize[0] !== w || preResizeSize[1] !== h)
    ? ` · <strong>resized:</strong> ${preResizeSize[0]}×${preResizeSize[1]} → ${w}×${h}`
    : '';
  const psNote = ps ? `${ps}px (override)` : 'auto';
  setMeta(
    `<strong>snapped:</strong> ${snapped.width}×${snapped.height}` +
    ` · <strong>output:</strong> ${w}×${h}${trimNote}` +
    resizeNote +
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

for (const btn of els.finalSizeButtons) {
  btn.addEventListener('click', () => {
    finalSizeMode = 'custom';
    const size = parseInt(btn.dataset.finalSize, 10);
    if (els.preserveAspect.checked && lastNativeSize) {
      setFinalFields(size, aspectHeight(size, lastNativeSize));
    } else {
      setFinalFields(size, size);
    }
    scheduleRun();
  });
}
els.clearFinalSize.addEventListener('click', () => {
  finalSizeMode = 'native';
  if (lastNativeSize) setFinalFields(lastNativeSize.w, lastNativeSize.h);
  else setFinalFields('', '');
  scheduleRun();
});

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
els.finalWidth.addEventListener('change', () => {
  finalSizeMode = (els.finalWidth.value.trim() || els.finalHeight.value.trim()) ? 'custom' : 'native';
  if (finalSizeMode === 'custom') syncFinalAspectFrom('w');
  scheduleRun();
});
els.finalHeight.addEventListener('change', () => {
  finalSizeMode = (els.finalWidth.value.trim() || els.finalHeight.value.trim()) ? 'custom' : 'native';
  if (finalSizeMode === 'custom') syncFinalAspectFrom('h');
  scheduleRun();
});
els.preserveAspect.addEventListener('change', () => {
  if (els.preserveAspect.checked && finalSizeMode === 'custom') {
    syncFinalAspectFrom(els.finalWidth.value.trim() ? 'w' : 'h');
  }
  scheduleRun();
});
els.trim.addEventListener('change', scheduleRun);
els.chromaColor.addEventListener('change', scheduleRun);
for (const r of els.chromaInputs) r.addEventListener('change', scheduleRun);

window.addEventListener('resize', () => {
  updateResultPreviewScale(els.resultCanvas.width, els.resultCanvas.height);
});

els.run.addEventListener('click', runPipeline);

els.download.addEventListener('click', () => {
  if (!resultBlobUrl) return;
  saveResult();
});

async function saveResult() {
  const blob = await fetch(resultBlobUrl).then(r => r.blob());

  if ('showSaveFilePicker' in window) {
    try {
      setStatus('choose output file');
      const file = await window.showSaveFilePicker({
        suggestedName: resultName,
        startIn: 'downloads',
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`saved ${resultName}`);
      return;
    } catch (e) {
      if (e?.name === 'AbortError') {
        setStatus('save canceled');
        return;
      }
      setStatus('save picker failed - using download');
    }
  } else if ('showDirectoryPicker' in window) {
    try {
      setStatus('choose output folder');
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      const file = await dir.getFileHandle(resultName, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`saved ${resultName}`);
      return;
    } catch (e) {
      if (e?.name === 'AbortError') {
        setStatus('save canceled');
        return;
      }
      setStatus('folder save failed - using download');
    }
  }

  const a = document.createElement('a');
  a.href = resultBlobUrl;
  a.download = resultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus('download started');
}

els.file.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

els.drop.addEventListener('click', e => {
  if (e.target !== els.file && e.target.tagName !== 'LABEL') els.file.click();
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

setStatus('ready - drop an image on Source');
