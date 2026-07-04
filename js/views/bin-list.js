import { getAllBins, getItemsForBin } from '../db.js';
import { blobToObjectUrl } from '../utils.js';

export async function renderBinList(container, { onOpenBin }) {
  container.innerHTML = '<p class="muted">Loading bins…</p>';

  const bins = await getAllBins();

  if (!bins.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No bins yet.</p>
        <p>Tap <strong>Log a bin</strong> on Home to get started.</p>
      </div>
    `;
    return;
  }

  const list = document.createElement('div');
  list.className = 'bin-list';

  for (const bin of bins) {
    const items = await getItemsForBin(bin.id);
    const thumbUrl = bin.binPhotoThumbnail
      ? blobToObjectUrl(bin.binPhotoThumbnail)
      : (items[0]?.thumbnailBlob ? blobToObjectUrl(items[0].thumbnailBlob) : null);

    const itemThumbs = items
      .filter((i) => i.thumbnailBlob)
      .slice(0, 5)
      .map((i) => `<img src="${blobToObjectUrl(i.thumbnailBlob)}" alt="">`)
      .join('');

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'bin-card';
    card.innerHTML = `
      ${thumbUrl ? `<img class="bin-card-thumb" src="${thumbUrl}" alt="">` : '<div class="bin-card-thumb"></div>'}
      <div class="bin-card-body">
        <p class="bin-card-title">${escape(bin.displayName)}</p>
        <p class="bin-card-meta">${items.length} item${items.length === 1 ? '' : 's'}${bin.entryMethod === 'qr' ? ` · ${escape(bin.id)}` : ''}</p>
        ${itemThumbs ? `<div class="thumb-strip">${itemThumbs}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => onOpenBin(bin.id));
    list.appendChild(card);
  }

  container.innerHTML = '';
  container.appendChild(list);
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}