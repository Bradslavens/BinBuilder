// Provides an in-memory IndexedDB so db.js can be exercised in tests.
import 'fake-indexeddb/auto';

// jsdom doesn't implement crypto.randomUUID in all versions; provide a fallback.
if (!globalThis.crypto) globalThis.crypto = {};
if (typeof globalThis.crypto.randomUUID !== 'function') {
  let counter = 0;
  globalThis.crypto.randomUUID = () =>
    `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;
}
