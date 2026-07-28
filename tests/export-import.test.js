import { describe, it, expect } from 'vitest';
import { itemMetaForExport, itemMetaFromImport } from '../js/export-import.js';

// Backups previously copied an explicit field list that omitted aiLabel, so
// every AI description was silently destroyed by a backup/restore round trip.
// These cover the one mapping both the ZIP and JSON paths now share.

const baseItem = {
  id: 'item-1',
  binId: 'bin-1',
  label: '',
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('itemMetaForExport', () => {
  it('carries both descriptions', () => {
    const meta = itemMetaForExport({ ...baseItem, aiLabel: 'a blue mug', userLabel: "Dad's mug" });
    expect(meta.aiLabel).toBe('a blue mug');
    expect(meta.userLabel).toBe("Dad's mug");
  });

  it('keeps an empty aiLabel, which means "described, nothing to say"', () => {
    expect(itemMetaForExport({ ...baseItem, aiLabel: '' })).toHaveProperty('aiLabel', '');
  });

  it('omits aiLabel entirely when the item was never described', () => {
    // Emitting null/'' here would tell the next AI pass the item was already
    // processed and it would never be described.
    expect(itemMetaForExport(baseItem)).not.toHaveProperty('aiLabel');
  });

  it('drops photo blobs, which are stored as separate files', () => {
    const meta = itemMetaForExport({ ...baseItem, imageBlob: {}, thumbnailBlob: {} });
    expect(meta).not.toHaveProperty('imageBlob');
    expect(meta).not.toHaveProperty('thumbnailBlob');
  });
});

describe('itemMetaFromImport', () => {
  it('restores both descriptions', () => {
    const meta = itemMetaFromImport({ ...baseItem, aiLabel: 'a blue mug', userLabel: "Dad's mug" });
    expect(meta.aiLabel).toBe('a blue mug');
    expect(meta.userLabel).toBe("Dad's mug");
  });

  it('restores an empty aiLabel as empty, not as unprocessed', () => {
    expect(itemMetaFromImport({ ...baseItem, aiLabel: '' })).toHaveProperty('aiLabel', '');
  });

  it('leaves aiLabel unset for older backups that never stored it', () => {
    const meta = itemMetaFromImport(baseItem);
    expect(meta).not.toHaveProperty('aiLabel');
    expect(meta).not.toHaveProperty('userLabel');
  });

  it('defaults a missing label to an empty string', () => {
    expect(itemMetaFromImport({ id: 'x', binId: 'b', createdAt: 'now' }).label).toBe('');
  });
});

describe('backup round trip', () => {
  it('survives JSON serialization with descriptions intact', () => {
    const items = [
      { ...baseItem, id: 'a', aiLabel: 'a blue mug', userLabel: "Dad's mug" },
      { ...baseItem, id: 'b', aiLabel: '' },
      { ...baseItem, id: 'c' },
    ];

    const manifest = JSON.parse(JSON.stringify(items.map(itemMetaForExport)));
    const restored = manifest.map(itemMetaFromImport);

    expect(restored[0].userLabel).toBe("Dad's mug");
    expect(restored[0].aiLabel).toBe('a blue mug');
    expect(restored[1].aiLabel).toBe('');
    expect(restored[2]).not.toHaveProperty('aiLabel');
  });
});
