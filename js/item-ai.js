import { getAllItems, getItem, putItem } from './db.js';
import { resizeImageBlob } from './thumbnails.js';
import { blobToDataUrl } from './utils.js';
import { getAiKey, getAiModel } from './ai-settings.js';

// Background pass that asks an AI model (via the user's own OpenRouter key)
// to describe each item photo into a searchable `aiLabel` field.
// `aiLabel === undefined` marks an item as not yet processed, so interrupted
// runs resume later.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_DESCRIPTION_CHARS = 250;
const PROMPT =
  'Describe the main item in this photo for a search index, in at most ' +
  '250 characters. Mention the object, its colors, size, any visible text ' +
  'or brand names, pictures or logos, and any other detail that would help ' +
  'someone find it later. Reply with only the description, no preamble.';

let running = false;
let lastError = '';

// Surfaced on the settings page so a bad key or empty credits isn't silent.
export function getLastAiError() {
  return lastError;
}

export function cleanAiLabel(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .slice(0, MAX_DESCRIPTION_CHARS)
    .trim();
}

export function labelFromResponse(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return cleanAiLabel(content);
  if (Array.isArray(content)) {
    return cleanAiLabel(content.map((part) => part?.text || '').join(' '));
  }
  return '';
}

async function callOpenRouter(key, body) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `AI request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) message = errBody.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function requestItemLabel(imageBlob, key = getAiKey(), model = getAiModel()) {
  // Downscale before upload: smaller, cheaper, faster, and plenty for
  // recognizing an object and reading any large text on it.
  const small = await resizeImageBlob(imageBlob, 512, 0.8);
  const dataUrl = await blobToDataUrl(small);

  const data = await callOpenRouter(key, {
    model,
    max_tokens: 120,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  return labelFromResponse(data);
}

// One cheap text-only round trip so the settings page can verify a key.
export async function testAiKey(key, model) {
  try {
    const data = await callOpenRouter(key, {
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    labelFromResponse(data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function processPendingItemAi() {
  if (running || !getAiKey()) return;
  running = true;

  try {
    const items = await getAllItems();
    const pending = items.filter(
      (item) => item.imageBlob && item.aiLabel === undefined
    );

    for (const item of pending) {
      let label;
      try {
        label = await requestItemLabel(item.imageBlob);
        lastError = '';
      } catch (e) {
        // Whether it's a bad key, empty credits, or being offline, the next
        // item would fail the same way — stop and retry on a later run.
        lastError = e.message || 'AI naming failed';
        return;
      }

      // Re-read after the slow request and set only our own field, so a
      // concurrent edit (like a deletion) isn't clobbered by writing back the
      // stale copy we captured before the request started.
      const fresh = await getItem(item.id);
      if (!fresh || fresh.aiLabel !== undefined) continue;
      fresh.aiLabel = label;
      await putItem(fresh);
    }
  } finally {
    running = false;
  }
}
