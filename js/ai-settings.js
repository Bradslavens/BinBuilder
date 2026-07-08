// The OpenRouter key and model live in localStorage on purpose: backups
// (export-import.js) only read IndexedDB, so the key can never end up inside
// an exported ZIP/JSON file, and it is sent to no host except openrouter.ai.
const KEY_STORAGE = 'binbuilder-openrouter-key';
const MODEL_STORAGE = 'binbuilder-openrouter-model';

// Small vision models name household objects as well as large ones; Haiku is
// the cost/quality sweet spot for "what is this?" (~$0.001 per photo).
export const DEFAULT_AI_MODEL = 'anthropic/claude-haiku-4.5';

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function getAiKey() {
  return read(KEY_STORAGE);
}

export function setAiKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function removeAiKey() {
  localStorage.removeItem(KEY_STORAGE);
}

export function getAiModel() {
  return read(MODEL_STORAGE).trim() || DEFAULT_AI_MODEL;
}

export function setAiModel(model) {
  const m = model.trim();
  if (m && m !== DEFAULT_AI_MODEL) localStorage.setItem(MODEL_STORAGE, m);
  else localStorage.removeItem(MODEL_STORAGE);
}

export function aiEnabled() {
  return !!getAiKey();
}
