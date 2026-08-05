import { getAllItems, getItem, putItem } from './db.js';
import { resizeImageBlob } from './thumbnails.js';
import { blobToDataUrl } from './utils.js';
import { getAiKey, getAiModel } from './ai-settings.js';
import { needsAiDescription } from './items.js';

// Background pass that asks an AI model (via the user's own OpenRouter key)
// to describe each item photo into a searchable `aiLabel` field.
// `aiLabel === undefined` marks an item as not yet processed, so interrupted
// runs resume later.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_DESCRIPTION_CHARS = 250;

// Photos are downscaled before upload, but not far. This was 512px, which
// turned out to be the main reason items got described wrongly: a brand name or
// small print on a box is unreadable at that size, so the model guesses. Vision
// models accept up to ~2576px on the long edge; 1024 is the point where text on
// a typical arm's-length item photo becomes legible without paying for pixels
// nobody reads. Roughly triples image tokens (still a fraction of a cent per
// photo on the default model) and is a far cheaper fix than a pricier model.
export const AI_IMAGE_MAX_WIDTH = 1024;
export const MAX_KEYWORDS = 8;
const MAX_KEYWORD_CHARS = 40;
const PROMPT =
  'Describe the main item in this photo for a search index. Reply with only ' +
  'this JSON, no code fences or preamble: ' +
  '{"description":"...","keywords":["...",...]}. ' +
  'description: at most 250 characters — the object, its colors, size, any ' +
  'visible text or brand names, pictures or logos, and any other detail that ' +
  'would help someone find it later. If the item is unclear, say so rather ' +
  'than guess. keywords: 3-8 short search terms, one per distinct thing ' +
  'visible — include incidental ones like a hand holding the item or ' +
  'background fabric, so they can be reviewed and removed.';

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

// Keywords are chips the user can delete one by one, so junk entries cost a
// tap each: trim, dedupe case-insensitively, and cap the count.
export function cleanKeywords(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const kw = String(typeof raw === 'string' || typeof raw === 'number' ? raw : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_KEYWORD_CHARS);
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    out.push(kw);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

function contentText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join(' ');
  return '';
}

// The model is asked for JSON, but a model that ignores that (or an older
// mocked/cached response) still yields a usable result: the whole text becomes
// the description and there are simply no keywords.
export function resultFromResponse(data) {
  const text = contentText(data).trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        label: cleanAiLabel(parsed.description),
        keywords: cleanKeywords(parsed.keywords),
      };
    }
  } catch {
    /* not JSON — fall through */
  }
  return { label: cleanAiLabel(text), keywords: [] };
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

export async function describeItemPhoto(imageBlob, key = getAiKey(), model = getAiModel()) {
  const small = await resizeImageBlob(imageBlob, AI_IMAGE_MAX_WIDTH, 0.85);
  const dataUrl = await blobToDataUrl(small);

  const data = await callOpenRouter(key, {
    model,
    // Enough for the JSON wrapper, a full 250-char description, and 8 keywords.
    max_tokens: 250,
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
  return resultFromResponse(data);
}

// One cheap text-only round trip so the settings page can verify a key.
export async function testAiKey(key, model) {
  try {
    const data = await callOpenRouter(key, {
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    resultFromResponse(data);
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
    // Skips items the user has already described themselves, so we never spend
    // a request producing a label that is overridden and never displayed.
    const pending = items.filter(needsAiDescription);

    for (const item of pending) {
      let result;
      try {
        result = await describeItemPhoto(item.imageBlob);
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
      fresh.aiLabel = result.label;
      if (result.keywords.length) fresh.aiKeywords = result.keywords;
      await putItem(fresh);
    }
  } finally {
    running = false;
  }
}
