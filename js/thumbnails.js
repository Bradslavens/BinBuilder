import { loadImageFromBlob, canvasToJpegBlob } from './utils.js';

export async function createThumbnail(blob, maxWidth = 150, quality = 0.75) {
  if (!blob) return null;

  const img = await loadImageFromBlob(blob);
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToJpegBlob(canvas, quality);
}

export async function resizeImageBlob(blob, maxWidth = 1280, quality = 0.88) {
  const img = await loadImageFromBlob(blob);
  if (img.width <= maxWidth) return blob;

  const scale = maxWidth / img.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToJpegBlob(canvas, quality);
}