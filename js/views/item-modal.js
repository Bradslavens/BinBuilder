import { getItem, putItem, deleteItem } from '../db.js';
import { blobToObjectUrl, confirmDialog, promptDialog, escapeHtml } from '../utils.js';
import {
  itemDescription, hasUserDescription, cleanUserDescription, MAX_USER_DESCRIPTION_CHARS,
  itemKeywords,
} from '../items.js';
import { cleanKeywords, MAX_KEYWORDS } from '../item-ai.js';
import { showToast } from '../app.js';

// Shared by the bin detail grid and the search view so a description can be
// corrected from wherever the user happens to be browsing.
//
// `onChange` fires after any write, so the caller can refresh its own copy of
// the items — both views snapshot them when they render.
export function openItemModal(modal, item, { onChange, onOpenBin } = {}) {
  let current = item;
  let editing = false;

  const close = () => modal.classList.add('hidden');
  const changed = () => { if (onChange) onChange(); };

  function descriptionHtml() {
    if (editing) return '';

    const text = itemDescription(current);
    if (text) {
      const badge = hasUserDescription(current)
        ? '<p class="muted" style="margin:4px 0 0;font-size:0.8rem">Edited by you</p>'
        : '';
      return `<p style="margin:12px 0 0;line-height:1.5">${escapeHtml(text)}</p>${badge}`;
    }
    // aiLabel is undefined until the AI pass has looked at the photo; '' means
    // it looked and had nothing to say. Either way the user can write their own.
    if (current.aiLabel === undefined) {
      return '<p class="muted" style="margin:12px 0 0">No description yet — add one below, or turn on AI in More to describe items automatically.</p>';
    }
    return '<p class="muted" style="margin:12px 0 0">No description.</p>';
  }

  // Keywords render as chips with a × each: the AI tags everything visible in
  // the photo, so wrong-but-honest tags (a hand, background fabric) are removed
  // with one tap instead of an edit session. Adding is capped at MAX_KEYWORDS
  // to keep search text and the chip row bounded.
  function keywordsHtml() {
    if (editing) return '';
    const kws = itemKeywords(current);
    const addBtn = kws.length < MAX_KEYWORDS
      ? '<button type="button" class="chip chip-add" id="btn-add-keyword">+ keyword</button>'
      : '';
    if (!kws.length && current.aiLabel === undefined) return '';
    return `
      <div class="chip-row">
        ${kws.map((kw, i) => `
          <span class="chip">${escapeHtml(kw)}
            <button type="button" class="chip-x" data-kw="${i}" aria-label="Remove keyword ${escapeHtml(kw)}">×</button>
          </span>`).join('')}
        ${addBtn}
      </div>
    `;
  }

  async function mutateKeywords(update) {
    // Same re-read rule as saveDescription: don't clobber concurrent writes.
    const fresh = await getItem(current.id);
    if (!fresh) {
      showToast('That item no longer exists');
      close();
      changed();
      return;
    }
    const next = cleanKeywords(update(itemKeywords(fresh)));
    if (next.length) fresh.aiKeywords = next;
    else delete fresh.aiKeywords;
    await putItem(fresh);
    current = fresh;
    render();
    changed();
  }

  function editorHtml() {
    if (!editing) return '';
    return `
      <div class="label-field">
        <label for="item-description-input">Description</label>
        <textarea class="text-area" id="item-description-input" maxlength="${MAX_USER_DESCRIPTION_CHARS}"
          placeholder="What is this item?">${escapeHtml(itemDescription(current))}</textarea>
      </div>
      <button type="button" class="btn btn-primary" id="btn-save-description">Save description</button>
      <button type="button" class="btn btn-secondary" id="btn-cancel-description">Cancel</button>
    `;
  }

  function actionsHtml() {
    if (editing) return '';

    // Only offer a revert when there is an AI description underneath to revert
    // to; otherwise the same button just empties the field.
    const restore = hasUserDescription(current)
      ? `<button type="button" class="btn btn-secondary" id="btn-restore-description">${
        current.aiLabel ? 'Restore AI description' : 'Clear description'}</button>`
      : '';

    return `
      <button type="button" class="btn btn-secondary" id="btn-edit-description">Edit description</button>
      ${restore}
      ${onOpenBin ? '<button type="button" class="btn btn-secondary" id="btn-open-bin">Open bin</button>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" id="btn-delete-item">Delete item</button>
        <button type="button" class="btn btn-secondary" id="btn-close-modal">Close</button>
      </div>
    `;
  }

  async function saveDescription(text) {
    const value = cleanUserDescription(text);

    // Re-read before writing: the background AI pass may have set aiLabel on
    // this item while the modal sat open, and writing back the copy we captured
    // when it opened would erase that.
    const fresh = await getItem(current.id);
    if (!fresh) {
      showToast('That item no longer exists');
      close();
      changed();
      return;
    }

    if (value) fresh.userLabel = value;
    else delete fresh.userLabel;
    await putItem(fresh);

    current = fresh;
    editing = false;
    render();
    showToast(value ? 'Description saved' : 'Description cleared');
    changed();
  }

  function render() {
    const imgUrl = current.imageBlob ? blobToObjectUrl(current.imageBlob) : null;
    const addedOn = current.createdAt
      ? new Date(current.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    modal.classList.remove('hidden');
    modal.innerHTML = `
      ${imgUrl ? `<img src="${imgUrl}" alt="">` : '<p class="muted">No photo</p>'}
      ${descriptionHtml()}
      ${keywordsHtml()}
      ${addedOn ? `<p class="muted" style="margin:8px 0 0;font-size:0.85rem">Added ${escapeHtml(addedOn)}</p>` : ''}
      ${editorHtml()}
      ${actionsHtml()}
    `;

    modal.querySelector('#btn-close-modal')?.addEventListener('click', close);

    modal.querySelectorAll('.chip-x').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.kw);
        mutateKeywords((kws) => kws.filter((_, idx) => idx !== i));
      });
    });

    modal.querySelector('#btn-add-keyword')?.addEventListener('click', () => {
      const kw = promptDialog('Add a search keyword').trim();
      if (kw) mutateKeywords((kws) => [...kws, kw]);
    });

    modal.querySelector('#btn-edit-description')?.addEventListener('click', () => {
      editing = true;
      render();
      const input = modal.querySelector('#item-description-input');
      input.focus();
      // Put the caret at the end rather than selecting everything, so a small
      // correction to an AI description doesn't get wiped by the first keypress.
      input.setSelectionRange(input.value.length, input.value.length);
    });

    modal.querySelector('#btn-cancel-description')?.addEventListener('click', () => {
      editing = false;
      render();
    });

    modal.querySelector('#btn-save-description')?.addEventListener('click', () => {
      saveDescription(modal.querySelector('#item-description-input').value);
    });

    modal.querySelector('#btn-restore-description')?.addEventListener('click', () => {
      saveDescription('');
    });

    modal.querySelector('#btn-open-bin')?.addEventListener('click', () => {
      close();
      onOpenBin(current.binId);
    });

    modal.querySelector('#btn-delete-item')?.addEventListener('click', async () => {
      if (!confirmDialog('Delete this item?')) return;
      await deleteItem(current.id);
      showToast('Item deleted');
      close();
      changed();
    });
  }

  render();
}
