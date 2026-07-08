import { getAllItems, getItem, putItem } from './db.js';
import { recognizeTextFromBlob } from './ocr.js';

// Background pass that extracts any printed text on item photos (brand names,
// model numbers) into a searchable `ocrText` field. Items are processed one
// at a time in the tesseract worker; `ocrText === undefined` marks an item as
// not yet processed, so interrupted runs resume on the next call.
let running = false;

export async function processPendingItemOcr() {
  if (running) return;
  running = true;

  try {
    const items = await getAllItems();
    const pending = items.filter(
      (item) => item.imageBlob && item.ocrText === undefined
    );

    for (const { id } of pending) {
      // Re-read right before writing so a label edit made while OCR was
      // running isn't clobbered by the stale copy.
      const item = await getItem(id);
      if (!item || !item.imageBlob || item.ocrText !== undefined) continue;

      let text;
      try {
        text = await recognizeTextFromBlob(item.imageBlob);
      } catch {
        // OCR engine unavailable (e.g. offline before the language data was
        // ever downloaded) — leave items unprocessed and retry next launch.
        return;
      }

      item.ocrText = text;
      await putItem(item);
    }
  } finally {
    running = false;
  }
}
