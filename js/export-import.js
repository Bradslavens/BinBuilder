import { getAllBins, getAllItems, importData } from './db.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mime = 'image/jpeg') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup() {
  const bins = await getAllBins();
  const items = await getAllItems();

  const zip = new window.JSZip();
  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bins: [],
    items: [],
  };

  for (const bin of bins) {
    const entry = {
      id: bin.id,
      displayName: bin.displayName,
      description: bin.description,
      entryMethod: bin.entryMethod,
      createdAt: bin.createdAt,
      binPhotoFile: null,
    };

    if (bin.binPhotoBlob) {
      const fileName = `bin-photos/${bin.id}.jpg`;
      zip.file(fileName, bin.binPhotoBlob);
      entry.binPhotoFile = fileName;
    }

    manifest.bins.push(entry);
  }

  for (const item of items) {
    const entry = {
      id: item.id,
      binId: item.binId,
      label: item.label,
      createdAt: item.createdAt,
      isTextOnly: !!item.isTextOnly,
      imageFile: null,
      thumbnailFile: null,
    };

    if (item.imageBlob) {
      const imageFile = `item-images/${item.id}.jpg`;
      zip.file(imageFile, item.imageBlob);
      entry.imageFile = imageFile;
    }
    if (item.thumbnailBlob) {
      const thumbFile = `item-images/${item.id}-thumb.jpg`;
      zip.file(thumbFile, item.thumbnailBlob);
      entry.thumbnailFile = thumbFile;
    }

    manifest.items.push(entry);
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `binbuilder-backup-${date}.zip`);
}

export async function exportJsonOnly() {
  const bins = await getAllBins();
  const items = await getAllItems();

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bins: await Promise.all(bins.map(async (b) => ({
      ...b,
      binPhotoBlob: b.binPhotoBlob ? await blobToBase64(b.binPhotoBlob) : null,
      binPhotoThumbnail: b.binPhotoThumbnail ? await blobToBase64(b.binPhotoThumbnail) : null,
    }))),
    items: await Promise.all(items.map(async (i) => ({
      ...i,
      imageBlob: i.imageBlob ? await blobToBase64(i.imageBlob) : null,
      thumbnailBlob: i.thumbnailBlob ? await blobToBase64(i.thumbnailBlob) : null,
    }))),
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `binbuilder-backup-${date}.json`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file, mode = 'merge') {
  const name = file.name.toLowerCase();

  if (name.endsWith('.zip')) {
    return importZip(file, mode);
  }
  if (name.endsWith('.json')) {
    return importJson(file, mode);
  }
  throw new Error('Unsupported file type. Use .zip or .json');
}

async function importZip(file, mode) {
  const zip = await window.JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid backup: manifest.json not found');

  const manifest = JSON.parse(await manifestFile.async('string'));
  const bins = [];
  const items = [];

  for (const b of manifest.bins) {
    const bin = {
      id: b.id,
      displayName: b.displayName,
      description: b.description || '',
      entryMethod: b.entryMethod || 'qr',
      createdAt: b.createdAt,
      binPhotoBlob: null,
      binPhotoThumbnail: null,
    };

    if (b.binPhotoFile) {
      const f = zip.file(b.binPhotoFile);
      if (f) {
        bin.binPhotoBlob = await f.async('blob');
        bin.binPhotoThumbnail = bin.binPhotoBlob;
      }
    }
    bins.push(bin);
  }

  for (const it of manifest.items) {
    const item = {
      id: it.id,
      binId: it.binId,
      label: it.label || '',
      createdAt: it.createdAt,
      isTextOnly: !!it.isTextOnly,
      imageBlob: null,
      thumbnailBlob: null,
    };

    if (it.imageFile) {
      const f = zip.file(it.imageFile);
      if (f) item.imageBlob = await f.async('blob');
    }
    if (it.thumbnailFile) {
      const f = zip.file(it.thumbnailFile);
      if (f) item.thumbnailBlob = await f.async('blob');
    } else if (item.imageBlob) {
      item.thumbnailBlob = item.imageBlob;
    }

    items.push(item);
  }

  await importData(bins, items, mode);
  return { bins: bins.length, items: items.length };
}

async function importJson(file, mode) {
  const text = await file.text();
  const payload = JSON.parse(text);

  const bins = (payload.bins || []).map((b) => ({
    id: b.id,
    displayName: b.displayName,
    description: b.description || '',
    entryMethod: b.entryMethod || 'qr',
    createdAt: b.createdAt,
    binPhotoBlob: b.binPhotoBlob ? base64ToBlob(b.binPhotoBlob) : null,
    binPhotoThumbnail: b.binPhotoThumbnail ? base64ToBlob(b.binPhotoThumbnail) : null,
  }));

  const items = (payload.items || []).map((it) => ({
    id: it.id,
    binId: it.binId,
    label: it.label || '',
    createdAt: it.createdAt,
    isTextOnly: !!it.isTextOnly,
    imageBlob: it.imageBlob ? base64ToBlob(it.imageBlob) : null,
    thumbnailBlob: it.thumbnailBlob ? base64ToBlob(it.thumbnailBlob) : null,
  }));

  await importData(bins, items, mode);
  return { bins: bins.length, items: items.length };
}