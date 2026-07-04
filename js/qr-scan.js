import { supportsBarcodeDetector } from './utils.js';

const SCAN_INTERVAL_MS = 150;
const BIN_ID_PATTERN = /^BIN-[\w-]+$/i;

let detector = null;

async function getDetector() {
  if (detector) return detector;
  if (await supportsBarcodeDetector()) {
    try {
      detector = new BarcodeDetector({ formats: ['qr_code'] });
      return detector;
    } catch {
      detector = null;
    }
  }
  return null;
}

function normalizeBinId(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function isValidBinId(id) {
  return id.length >= 3;
}

async function scanWithBarcodeDetector(videoEl) {
  const det = await getDetector();
  if (!det) return null;

  try {
    const codes = await det.detect(videoEl);
    if (!codes.length) return null;
    const id = normalizeBinId(codes[0].rawValue);
    return isValidBinId(id) ? id : null;
  } catch {
    return null;
  }
}

function scanWithJsQR(videoEl) {
  if (typeof window.jsQR !== 'function') return null;

  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = window.jsQR(imageData.data, canvas.width, canvas.height, {
    inversionAttempts: 'dontInvert',
  });

  if (!result) return null;
  const id = normalizeBinId(result.data);
  return isValidBinId(id) ? id : null;
}

export async function scanQrFromVideo(videoEl) {
  const fromNative = await scanWithBarcodeDetector(videoEl);
  if (fromNative) return fromNative;
  return scanWithJsQR(videoEl);
}

export function startQrScanLoop(videoEl, onDetected) {
  let running = true;
  let lastId = null;
  let lastDetectedAt = 0;

  const tick = async () => {
    if (!running) return;

    const id = await scanQrFromVideo(videoEl);
    const now = Date.now();

    if (id && (id !== lastId || now - lastDetectedAt > 2000)) {
      lastId = id;
      lastDetectedAt = now;
      running = false;
      onDetected(id);
      return;
    }

    setTimeout(tick, SCAN_INTERVAL_MS);
  };

  tick();

  return () => {
    running = false;
  };
}

export { BIN_ID_PATTERN };