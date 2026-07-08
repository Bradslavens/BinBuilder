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

    for (const item of pending) {
      let text;
      try {
        text = await recognizeTextFromBlob(item.imageBlob);
      } catch {
        // OCR engine unavailable (e.g. offline before the language data was
        // ever downloaded) — leave items unprocessed and retry next launch.
        return;
      }

      // Re-read after the slow OCR and set only our own field: the AI-naming
      // pass and label edits run concurrently, and writing back the copy from
      // before the OCR started would wipe whatever they saved meanwhile.
      const fresh = await getItem(item.id);
      if (!fresh || fresh.ocrText !== undefined) continue;
      fresh.ocrText = text;
      await putItem(fresh);
    }
  } finally {
    running = false;
  }
}
