export function uuid() {
  return crypto.randomUUID();
}

export function formatBinDateLabel(date = new Date()) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).replace(/^/, 'Bin ');
}

export function blobToObjectUrl(blob) {
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function supportsCamera() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function supportsVibrate() {
  return 'vibrate' in navigator;
}

export async function supportsBarcodeDetector() {
  return 'BarcodeDetector' in window;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function canvasToJpegBlob(canvas, quality = 0.85) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

export function fileToArrayBuffer(file) {
  return file.arrayBuffer();
}