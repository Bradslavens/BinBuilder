import {
  getBin, getItemsForBin, putItem, deleteItem, deleteBin, addTextItemToBin, updateBin,
} from '../db.js';
import { blobToObjectUrl, confirmDialog, escapeHtml } from '../utils.js';
import { showToast } from '../app.js';

export async function renderBinDetail(container, binId, { onBack, onLogMore }) {
  container.innerHTML = '<p class="muted">Loading…</p>';

  const bin = await getBin(binId);
  if (!bin) {
    container.innerHTML = `
      <div class="empty-state"><p>Bin not found.</p></div>
      <button type="button" class="btn btn-secondary" id="btn-back">Back</button>
    `;
    container.querySelector('#btn-back').addEventListener('click', onBack);
    return;
  }

  const items = await getItemsForBin(binId);
  const photoUrl = bin.binPhotoBlob ? blobToObjectUrl(bin.binPhotoBlob) : null;

  container.innerHTML = `
    <div class="stack">
      ${photoUrl ? `<img class="bin-header-photo" src="${photoUrl}" alt="Bin photo">` : ''}
      <div>
        <h2 style="margin:0 0 4px">${escapeHtml(bin.displayName)}</h2>
        ${bin.description ? `<p class="muted" style="margin:0">${escapeHtml(bin.description)}</p>` : ''}
        ${bin.entryMethod === 'qr' ? `<p class="muted" style="margin:8px 0 0;font-size:0.85rem">${escapeHtml(bin.id)}</p>` : ''}
      </div>
      <button type="button" class="btn btn-secondary" id="btn-edit-bin">Edit bin</button>
      <div id="edit-bin-form" class="hidden stack">
        <div class="label-field">
          <label for="edit-bin-name">Name</label>
          <input type="text" class="text-input" id="edit-bin-name" value="${escapeHtml(bin.displayName)}">
        </div>
        <div class="label-field">
          <label for="edit-bin-desc">Description</label>
          <textarea class="text-area" id="edit-bin-desc">${escapeHtml(bin.description || '')}</textarea>
        </div>
        <button type="button" class="btn btn-primary" id="btn-save-bin">Save changes</button>
        <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Cancel</button>
      </div>
      <button type="button" class="btn btn-primary" id="btn-log-more">Add more items</button>
      <button type="button" class="btn btn-secondary" id="btn-quick-add">Quick add (text only)</button>
      <div id="quick-add-form" class="hidden stack">
        <input type="text" class="text-input" id="quick-add-input" placeholder="Item description">
        <button type="button" class="btn btn-primary" id="btn-save-quick">Save text item</button>
      </div>
      <p class="muted" style="margin:0" id="item-count">${items.length} item${items.length === 1 ? '' : 's'}</p>
      <div class="photo-grid" id="item-grid"></div>
      <button type="button" class="btn btn-danger" id="btn-delete-bin">Delete bin</button>
    </div>
    <div id="item-modal" class="modal hidden"></div>
  `;

  const grid = container.querySelector('#item-grid');

  if (!items.length) {
    grid.innerHTML = '<p class="muted">No items yet.</p>';
  } else {
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-grid-item';
      if (item.thumbnailBlob) {
        btn.innerHTML = `<img src="${blobToObjectUrl(item.thumbnailBlob)}" alt="">`;
      } else {
        btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:0.75rem;text-align:center">${escapeHtml(item.label || 'Text item')}</div>`;
      }
      btn.addEventListener('click', () => openItemModal(container, item, binId, () => refreshGrid(grid, binId)));
      grid.appendChild(btn);
    }
  }

  container.querySelector('#btn-log-more').addEventListener('click', onLogMore);

  const editForm = container.querySelector('#edit-bin-form');
  container.querySelector('#btn-edit-bin').addEventListener('click', () => {
    editForm.classList.toggle('hidden');
    if (!editForm.classList.contains('hidden')) {
      container.querySelector('#edit-bin-name').focus();
    }
  });

  container.querySelector('#btn-cancel-edit').addEventListener('click', () => {
    editForm.classList.add('hidden');
  });

  container.querySelector('#btn-save-bin').addEventListener('click', async () => {
    const name = container.querySelector('#edit-bin-name').value.trim();
    if (!name) {
      showToast('Name cannot be empty');
      return;
    }
    bin.displayName = name;
    bin.description = container.querySelector('#edit-bin-desc').value.trim();
    await updateBin(bin);
    showToast('Bin updated');
    renderBinDetail(container, binId, { onBack, onLogMore });
  });

  const quickForm = container.querySelector('#quick-add-form');
  container.querySelector('#btn-quick-add').addEventListener('click', () => {
    quickForm.classList.toggle('hidden');
    container.querySelector('#quick-add-input').focus();
  });

  container.querySelector('#btn-save-quick').addEventListener('click', async () => {
    const label = container.querySelector('#quick-add-input').value;
    if (!label.trim()) {
      showToast('Enter a description');
      return;
    }
    await addTextItemToBin(binId, label);
    container.querySelector('#quick-add-input').value = '';
    quickForm.classList.add('hidden');
    showToast('Text item added');
    await refreshGrid(grid, binId);
  });

  container.querySelector('#btn-delete-bin').addEventListener('click', async () => {
    if (!confirmDialog('Delete this bin and all its items?')) return;
    await deleteBin(binId);
    showToast('Bin deleted');
    onBack();
  });
}

async function refreshGrid(grid, binId) {
  const items = await getItemsForBin(binId);
  const countEl = document.getElementById('item-count');
  if (countEl) {
    countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  }
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="muted">No items yet.</p>';
    return;
  }
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'photo-grid-item';
    if (item.thumbnailBlob) {
      btn.innerHTML = `<img src="${blobToObjectUrl(item.thumbnailBlob)}" alt="">`;
    } else {
      btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:0.75rem;text-align:center">${escapeHtml(item.label || 'Text item')}</div>`;
    }
    btn.addEventListener('click', () => {
      const modal = document.getElementById('item-modal');
      if (modal) openItemModal(modal.parentElement, item, binId, () => refreshGrid(grid, binId));
    });
    grid.appendChild(btn);
  }
}

function openItemModal(container, item, binId, onChange) {
  const modal = container.querySelector('#item-modal');
  const imgUrl = item.imageBlob ? blobToObjectUrl(item.imageBlob) : null;

  const addedOn = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const ocrSnippet = (item.ocrText || '').slice(0, 120);

  modal.classList.remove('hidden');
  modal.innerHTML = `
    ${imgUrl ? `<img src="${imgUrl}" alt="">` : '<p class="muted">Text-only item</p>'}
    <div class="label-field">
      <label for="item-label">Label</label>
      <input type="text" class="text-input" id="item-label" value="${escapeHtml(item.label || '')}">
    </div>
    ${addedOn ? `<p class="muted" style="margin:8px 0 0;font-size:0.85rem">Added ${escapeHtml(addedOn)}</p>` : ''}
    ${ocrSnippet ? `<p class="muted" style="margin:4px 0 0;font-size:0.85rem">Text on photo: ${escapeHtml(ocrSnippet)}${item.ocrText.length > 120 ? '…' : ''}</p>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn btn-primary" id="btn-save-label">Save label</button>
      <button type="button" class="btn btn-danger" id="btn-delete-item">Delete item</button>
      <button type="button" class="btn btn-secondary" id="btn-close-modal">Close</button>
    </div>
  `;

  const close = () => modal.classList.add('hidden');

  modal.querySelector('#btn-close-modal').addEventListener('click', close);
  modal.querySelector('#btn-save-label').addEventListener('click', async () => {
    item.label = modal.querySelector('#item-label').value;
    await putItem(item);
    showToast('Label saved');
    close();
    onChange();
  });
  modal.querySelector('#btn-delete-item').addEventListener('click', async () => {
    if (!confirmDialog('Delete this item?')) return;
    await deleteItem(item.id);
    showToast('Item deleted');
    close();
    onChange();
  });
}