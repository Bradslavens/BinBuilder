import { getAllBins, getAllItems } from '../db.js';
import { blobToObjectUrl, escapeHtml, debounce } from '../utils.js';
import { aiEnabled } from '../ai-settings.js';

export async function renderSearch(container, { onOpenBin }) {
  let bins = await getAllBins();
  let items = await getAllItems();
  const binMap = Object.fromEntries(bins.map((b) => [b.id, b]));

  // Newest first, matching bin detail's ordering.
  const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

  function renderAllItems(target) {
    if (!items.length) {
      target.innerHTML = '<p class="muted">No items yet.</p>';
      return;
    }

    target.innerHTML = `
      <p class="muted" style="margin:12px 0 8px">${items.length} item${items.length === 1 ? '' : 's'} — tap one to open its bin</p>
      <div class="photo-grid" id="all-items-grid"></div>
    `;
    const grid = target.querySelector('#all-items-grid');

    for (const item of [...items].sort(byNewest)) {
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
        btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:0.75rem;text-align:center">${escapeHtml(item.aiLabel || 'Item')}</div>`;
      }
      btn.addEventListener('click', () => onOpenBin(item.binId));

      const caption = document.createElement('div');
      caption.className = 'muted';
      caption.style.cssText = 'font-size:0.72rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      caption.textContent = item.aiLabel || bin?.displayName || '';

      cell.appendChild(btn);
      cell.appendChild(caption);
      grid.appendChild(cell);
    }
  }

  // Without an AI key, items have no descriptions to match, so search would be
  // empty. Just browse every item photo by date instead.
  if (!aiEnabled()) {
    container.innerHTML = `
      <p class="muted" style="line-height:1.5;margin:0 0 8px">
        Turn on AI item descriptions under <strong>More</strong> to search by what's in each photo. For now, browse your items by date.
      </p>
      <div id="search-results"></div>
    `;
    renderAllItems(container.querySelector('#search-results'));
    return;
  }

  container.innerHTML = `
    <input type="search" class="search-input" id="search-input" placeholder="Search item descriptions and bins" autocomplete="off">
    <button type="button" class="btn btn-secondary" id="btn-show-all" style="margin-top:12px;width:100%">Show all items</button>
    <div class="search-results" id="search-results">
      <p class="muted">Type to search across all bins.</p>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const results = container.querySelector('#search-results');
  const showAllBtn = container.querySelector('#btn-show-all');

  showAllBtn.addEventListener('click', () => {
    input.value = '';
    renderAllItems(results);
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

    // aiLabel is the AI-generated description of what's in the item photo.
    const matchedItems = items.filter((i) =>
      (i.aiLabel || '').toLowerCase().includes(q),
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
      btn.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="">` : '<div style="width:56px;height:56px;background:var(--surface2);border-radius:8px"></div>'}
        <div>
          <div style="font-weight:700">${escapeHtml(bin?.displayName || item.binId)}</div>
          <div class="muted" style="font-size:0.85rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(item.aiLabel || '')}</div>
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
