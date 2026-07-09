import { openDB } from 'idb';
import { uuid, formatBinDateLabel } from './utils.js';

const DB_NAME = 'binbuilder';
const DB_VERSION = 2;

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const bins = db.createObjectStore('bins', { keyPath: 'id' });
        bins.createIndex('createdAt', 'createdAt');
        bins.createIndex('displayName', 'displayName');

        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('binId', 'binId');
        items.createIndex('label', 'label');
        items.createIndex('createdAt', 'createdAt');
      },
    });
  }
  return dbPromise;
}

export async function getBin(id) {
  return (await getDb()).get('bins', id);
}

export async function getAllBins() {
  const bins = await (await getDb()).getAll('bins');
  return bins.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Re-slicing a Blob that was itself just read out of IndexedDB produces a
// fresh Blob instance backed by the same bytes. Without this, writing back a
// record whose photo Blob came from a previous get() (e.g. saving a label
// edit) can leave that Blob unreadable after the next reload on some
// browsers (a known IndexedDB/Blob storage bug), turning the photo into a
// broken-image placeholder.
function reslicedBlob(blob) {
  return blob instanceof Blob ? blob.slice(0, blob.size, blob.type) : blob;
}

export async function putBin(bin) {
  const safe = {
    ...bin,
    binPhotoBlob: reslicedBlob(bin.binPhotoBlob),
    binPhotoThumbnail: reslicedBlob(bin.binPhotoThumbnail),
  };
  return (await getDb()).put('bins', safe);
}

export async function deleteBin(id) {
  const db = await getDb();
  const items = await db.getAllFromIndex('items', 'binId', id);
  const tx = db.transaction(['bins', 'items'], 'readwrite');
  await tx.objectStore('bins').delete(id);
  for (const item of items) {
    await tx.objectStore('items').delete(item.id);
  }
  await tx.done;
}

export async function createBinFromQr(qrId) {
  const existing = await getBin(qrId);
  if (existing) return existing;

  const bin = {
    id: qrId,
    displayName: qrId,
    description: '',
    binPhotoBlob: null,
    binPhotoThumbnail: null,
    entryMethod: 'qr',
    createdAt: new Date().toISOString(),
  };
  await putBin(bin);
  return bin;
}

export async function createBinFromPhoto({ description, binPhotoBlob, binPhotoThumbnail }) {
  const now = new Date();
  const id = `bin-${now.getTime()}-${uuid().slice(0, 8)}`;
  const displayName = description?.trim() || formatBinDateLabel(now);

  const bin = {
    id,
    displayName,
    description: description?.trim() || '',
    binPhotoBlob,
    binPhotoThumbnail,
    entryMethod: 'photo',
    createdAt: now.toISOString(),
  };
  await putBin(bin);
  return bin;
}

export async function updateBin(bin) {
  await putBin(bin);
  return bin;
}

export async function getItemsForBin(binId) {
  const items = await (await getDb()).getAllFromIndex('items', 'binId', binId);
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getAllItems() {
  return (await getDb()).getAll('items');
}

export async function getItem(id) {
  return (await getDb()).get('items', id);
}

export async function putItem(item) {
  const safe = {
    ...item,
    imageBlob: reslicedBlob(item.imageBlob),
    thumbnailBlob: reslicedBlob(item.thumbnailBlob),
  };
  return (await getDb()).put('items', safe);
}

export async function deleteItem(id) {
  return (await getDb()).delete('items', id);
}

export async function addItemsToBin(binId, itemDataList) {
  const db = await getDb();
  const tx = db.transaction('items', 'readwrite');
  const created = [];
  for (const data of itemDataList) {
    const item = {
      id: uuid(),
      binId,
      imageBlob: data.imageBlob,
      thumbnailBlob: data.thumbnailBlob,
      createdAt: new Date().toISOString(),
    };
    await tx.store.put(item);
    created.push(item);
  }
  await tx.done;
  return created;
}

export async function getItemCountForBin(binId) {
  return (await getDb()).countFromIndex('items', 'binId', binId);
}

export async function clearAllData() {
  const db = await getDb();
  const tx = db.transaction(['bins', 'items'], 'readwrite');
  await tx.objectStore('bins').clear();
  await tx.objectStore('items').clear();
  await tx.done;
}

export async function importData(bins, items, mode = 'merge') {
  const db = await getDb();
  if (mode === 'replace') {
    await clearAllData();
  }
  const tx = db.transaction(['bins', 'items'], 'readwrite');
  for (const bin of bins) {
    await tx.objectStore('bins').put(bin);
  }
  for (const item of items) {
    await tx.objectStore('items').put(item);
  }
  await tx.done;
}