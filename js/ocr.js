import Tesseract from 'tesseract.js';

let workerPromise = null;

export async function initOcr(onProgress) {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: new URL('../vendor/tesseract/worker.min.js', import.meta.url).href,
      logger: (m) => {
        if (onProgress && m.status === 'loading language traineddata') {
          onProgress('Downloading text recognition data…');
        }
      },
    });
    // A failed init (offline before language data was cached) must not stick
    // as a permanently rejected promise — allow a retry on the next call.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

export async function recognizeTextFromBlob(blob, onProgress) {
  const worker = await initOcr(onProgress);
  const { data } = await worker.recognize(blob);
  return cleanOcrText(data.text);
}

export function cleanOcrText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function terminateOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}