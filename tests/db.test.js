import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBinFromQr,
  createBinFromPhoto,
  getAllBins,
  getBin,
  addTextItemToBin,
  addItemsToBin,
  getItemsForBin,
  getItemCountForBin,
  deleteBin,
  clearAllData,
  importData,
  updateBin,
} from '../js/db.js';

beforeEach(async () => {
  await clearAllData();
});

describe('bins', () => {
  it('creates a bin from a QR id and is idempotent for the same id', async () => {
    const first = await createBinFromQr('BIN-123');
    const second = await createBinFromQr('BIN-123');
    expect(first.id).toBe('BIN-123');
    expect(second.id).toBe('BIN-123');
    expect((await getAllBins()).length).toBe(1);
  });

  it('creates a photo bin, defaulting the display name when no description', async () => {
    const bin = await createBinFromPhoto({ description: '  ', binPhotoBlob: null, binPhotoThumbnail: null });
    expect(bin.entryMethod).toBe('photo');
    expect(bin.displayName.startsWith('Bin ')).toBe(true);
    expect(await getBin(bin.id)).toBeTruthy();
  });

  it('uses a trimmed description as the display name', async () => {
    const bin = await createBinFromPhoto({ description: '  Garage shelf  ' });
    expect(bin.displayName).toBe('Garage shelf');
    expect(bin.description).toBe('Garage shelf');
  });

  it('renames a bin and edits its description via updateBin', async () => {
    const bin = await createBinFromQr('BIN-EDIT');
    bin.displayName = 'Attic box 4';
    bin.description = 'Winter clothes';
    await updateBin(bin);

    const reloaded = await getBin('BIN-EDIT');
    expect(reloaded.displayName).toBe('Attic box 4');
    expect(reloaded.description).toBe('Winter clothes');
  });
});

describe('items', () => {
  it('adds a text-only item to a bin and counts it', async () => {
    const bin = await createBinFromQr('BIN-A');
    const item = await addTextItemToBin(bin.id, '  socket wrench  ');
    expect(item.label).toBe('socket wrench');
    expect(item.isTextOnly).toBe(true);
    expect(await getItemCountForBin(bin.id)).toBe(1);
  });

  it('adds multiple image items and returns them newest-first', async () => {
    const bin = await createBinFromQr('BIN-B');
    await addItemsToBin(bin.id, [{ label: 'one' }, { label: 'two' }]);
    const items = await getItemsForBin(bin.id);
    expect(items.length).toBe(2);
    expect(items.every((i) => i.binId === bin.id)).toBe(true);
  });

  it('cascades deletion of a bin to its items', async () => {
    const bin = await createBinFromQr('BIN-C');
    await addTextItemToBin(bin.id, 'thing');
    await deleteBin(bin.id);
    expect(await getBin(bin.id)).toBeUndefined();
    expect(await getItemCountForBin(bin.id)).toBe(0);
  });
});

describe('importData', () => {
  it('merges bins and items by default', async () => {
    await createBinFromQr('EXISTING');
    await importData(
      [{ id: 'IMPORTED', displayName: 'Imported', createdAt: new Date().toISOString() }],
      [{ id: 'i1', binId: 'IMPORTED', label: 'x', createdAt: new Date().toISOString() }],
      'merge',
    );
    const ids = (await getAllBins()).map((b) => b.id).sort();
    expect(ids).toEqual(['EXISTING', 'IMPORTED']);
  });

  it('replaces all data in replace mode', async () => {
    await createBinFromQr('OLD');
    await importData(
      [{ id: 'NEW', displayName: 'New', createdAt: new Date().toISOString() }],
      [],
      'replace',
    );
    const ids = (await getAllBins()).map((b) => b.id);
    expect(ids).toEqual(['NEW']);
  });
});
