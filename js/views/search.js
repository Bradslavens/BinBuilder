import { getAllBins, getAllItems } from '../db.js';
import { blobToObjectUrl, escapeHtml, debounce } from '../utils.js';

export async function renderSearch(container, { onOpenBin }) {
  let bins = await getAllBins();
  let items = await getAllItems();
  const binMap = Object.fromEntries(bins.map((b) => [b.id, b]));

  container.innerHTML = `
    <input type="search" class="search-input" id="search-input" placeholder="Search item labels and bin descriptions" autocomplete="off">
    <button type="button" class="btn btn-secondary" id="btn-show-all" style="margin-top:12px;width:100%">Show all items</button>
    <div class="search-results" id="search-results">
      <p class="muted">Type to search across all bins.</p>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const results = container.querySelector('#search-results');
  const showAllBtn = container.querySelector('#btn-show-all');

  function renderAllItems() {
    if (!items.length) {
      results.innerHTML = '<p class="muted">No items yet.</p>';
      return;
    }

    results.innerHTML = `
      <p class="muted" style="margin:12px 0 8px">${items.length} item${items.length === 1 ? '' : 's'} — tap one to open its bin</p>
      <div class="photo-grid" id="all-items-grid"></div>
    `;
    const grid = results.querySelector('#all-items-grid');

    // Newest first, same ordering as bin detail.
    const sorted = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const item of sorted) {
      const bin = binMap[item.binId];
      const cell = document.createElement('div');
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-grid-item';
      if (item.thumbnailBlob) {
        btn.innerHTML = `<img src="${blobToObjectUrl(item.thumbnailBlob)}" alt="">`;
      } else {
        btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:0.75rem;text-align:center">${escapeHtml(item.label || 'Text item')}</div>`;
      }
      btn.addEventListener('click', () => onOpenBin(item.binId));

      const caption = document.createElement('div');
      caption.className = 'muted';
      caption.style.cssText = 'font-size:0.72rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      caption.textContent = item.label || item.aiLabel || bin?.displayName || '';

      cell.appendChild(btn);
      cell.appendChild(caption);
      grid.appendChild(cell);
    }
  }

  showAllBtn.addEventListener('click', () => {
    input.value = '';
    renderAllItems();
  });

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

    // Labels are typed by the user; aiLabel is the AI-generated object name;
    // ocrText is printed text read off the item photo (brands, model numbers).
    const matchedItems = items.filter((i) =>
      (i.label || '').toLowerCase().includes(q)
      || (i.aiLabel || '').toLowerCase().includes(q)
      || (i.ocrText || '').toLowerCase().includes(q),
    );

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
      const labelMatched = (item.label || '').toLowerCase().includes(q);
      const aiMatched = (item.aiLabel || '').toLowerCase().includes(q);
      const matchNote = labelMatched ? '' : aiMatched ? ' · AI name' : ' · matched text on photo';
      btn.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="">` : '<div style="width:56px;height:56px;background:var(--surface2);border-radius:8px"></div>'}
        <div>
          <div style="font-weight:700">${escapeHtml(item.label || item.aiLabel || '(no label)')}</div>
          <div class="muted" style="font-size:0.85rem">${escapeHtml(bin?.displayName || item.binId)}${matchNote}</div>
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
