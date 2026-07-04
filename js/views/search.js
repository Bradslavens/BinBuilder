import { getAllBins, getAllItems } from '../db.js';
import { blobToObjectUrl, escapeHtml, debounce } from '../utils.js';

export async function renderSearch(container, { onOpenBin }) {
  let bins = await getAllBins();
  let items = await getAllItems();
  const binMap = Object.fromEntries(bins.map((b) => [b.id, b]));

  container.innerHTML = `
    <input type="search" class="search-input" id="search-input" placeholder="Search item labels and bin descriptions" autocomplete="off">
    <div class="search-results" id="search-results">
      <p class="muted">Type to search across all bins.</p>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const results = container.querySelector('#search-results');

  const runSearch = debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.innerHTML = '<p class="muted">Type to search across all bins.</p>';
      return;
    }

    const matchedBins = bins.filter((b) =>
      (b.displayName || '').toLowerCase().includes(q)
      || (b.description || '').toLowerCase().includes(q)
      || (b.id || '').toLowerCase().includes(q),
    );

    const matchedItems = items.filter((i) => (i.label || '').toLowerCase().includes(q));

    if (!matchedBins.length && !matchedItems.length) {
      results.innerHTML = '<p class="muted">No results.</p>';
      return;
    }

    results.innerHTML = '';

    for (const item of matchedItems) {
      const bin = binMap[item.binId];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-result';
      const thumb = item.thumbnailBlob ? blobToObjectUrl(item.thumbnailBlob) : null;
      btn.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="">` : '<div style="width:56px;height:56px;background:var(--surface2);border-radius:8px"></div>'}
        <div>
          <div style="font-weight:700">${escapeHtml(item.label || '(no label)')}</div>
          <div class="muted" style="font-size:0.85rem">${escapeHtml(bin?.displayName || item.binId)}</div>
        </div>
      `;
      btn.addEventListener('click', () => onOpenBin(item.binId));
      results.appendChild(btn);
    }

    for (const bin of matchedBins) {
      if (matchedItems.some((i) => i.binId === bin.id)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-result';
      const thumb = bin.binPhotoThumbnail ? blobToObjectUrl(bin.binPhotoThumbnail) : null;
      btn.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="">` : '<div style="width:56px;height:56px;background:var(--surface2);border-radius:8px"></div>'}
        <div>
          <div style="font-weight:700">${escapeHtml(bin.displayName)}</div>
          <div class="muted" style="font-size:0.85rem">Bin · ${escapeHtml(bin.description || 'no description')}</div>
        </div>
      `;
      btn.addEventListener('click', () => onOpenBin(bin.id));
      results.appendChild(btn);
    }
  }, 200);

  input.addEventListener('input', runSearch);
  input.focus();
}