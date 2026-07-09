import { exportBackup, exportJsonOnly, importBackupFile } from '../export-import.js';
import { showToast } from '../app.js';
import { confirmDialog, escapeHtml } from '../utils.js';
import { APP_VERSION } from '../version.js';
import { getAllItems } from '../db.js';
import {
  getAiKey, setAiKey, removeAiKey, getAiModel, setAiModel, DEFAULT_AI_MODEL,
} from '../ai-settings.js';
import { testAiKey, processPendingItemAi, getLastAiError } from '../item-ai.js';

export function renderSettings(container) {
  const savedKey = getAiKey();

  container.innerHTML = `
    <div class="stack">
      <div class="card">
        <p class="card-title">AI item descriptions</p>
        <p class="muted" style="margin:0 0 12px;line-height:1.5">
          Automatically describes each item photo &mdash; object, colors, size, any text or logos &mdash; so search can find it.
          Uses your own OpenRouter account &mdash; item photos are sent to the AI provider when this runs.
        </p>
        ${savedKey ? `
          <p class="muted" style="margin:0 0 8px">Key saved (&hellip;${escapeHtml(savedKey.slice(-4))})</p>
          <button type="button" class="btn btn-secondary" id="btn-ai-test">Test key</button>
          <button type="button" class="btn btn-danger" id="btn-ai-remove" style="margin-top:8px">Remove key</button>
        ` : `
          <div class="label-field">
            <label for="ai-key">OpenRouter API key</label>
            <input type="password" class="text-input" id="ai-key" placeholder="sk-or-..." autocomplete="off">
          </div>
          <button type="button" class="btn btn-primary" id="btn-ai-save">Save key</button>
        `}
        <div class="label-field" style="margin-top:12px">
          <label for="ai-model">Model</label>
          <input type="text" class="text-input" id="ai-model" value="${escapeHtml(getAiModel())}">
          <p class="muted" style="margin:4px 0 0;font-size:0.85rem">
            Leave as-is unless you have a reason to change it.
            <a href="https://openrouter.ai/models" target="_blank" rel="noopener">Browse models</a>
          </p>
        </div>
        <button type="button" class="btn btn-secondary" id="btn-ai-model-save" style="margin-top:8px">Save model</button>
        <p class="muted" id="ai-status" style="margin:12px 0 0;font-size:0.85rem"></p>
        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-weight:600">Don't have an OpenRouter key? Tap here</summary>
          <ol class="muted" style="margin:8px 0 0;padding-left:20px;line-height:1.7">
            <li>Go to <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a> and sign up (Google login works).</li>
            <li>Open <strong>Credits</strong> and buy a small amount &mdash; $5 is plenty. Your spending can never exceed what you've prepaid.</li>
            <li>Open <strong>Keys</strong> &rarr; <strong>Create Key</strong>. Set a <strong>credit limit</strong> on the key as an extra cap.</li>
            <li>Copy the key (starts with <code>sk-or-</code>) and paste it above.</li>
          </ol>
          <p class="muted" style="margin:8px 0 0;font-size:0.85rem">
            Describing costs well under a cent per photo with the default model &mdash; a few dollars per 1,000 items.
            The key is stored only on this device and is never included in backups.
          </p>
        </details>
      </div>

      <div class="card">
        <p class="card-title">Export backup</p>
        <p class="muted" style="margin:0 0 12px;line-height:1.5">Download all bins and item photos as a ZIP file.</p>
        <button type="button" class="btn btn-primary" id="btn-export-zip">Download ZIP</button>
        <button type="button" class="btn btn-secondary" id="btn-export-json" style="margin-top:8px">Download JSON only</button>
      </div>

      <div class="card">
        <p class="card-title">Import backup</p>
        <p class="muted" style="margin:0 0 12px;line-height:1.5">Restore from a previously exported .zip or .json file.</p>
        <label class="label-field">
          <span>Import mode</span>
          <select class="text-input" id="import-mode">
            <option value="merge">Merge with existing data</option>
            <option value="replace">Replace all data</option>
          </select>
        </label>
        <input type="file" id="import-file" accept=".zip,.json,application/json" class="text-input">
        <button type="button" class="btn btn-secondary" id="btn-import" style="margin-top:8px">Import</button>
      </div>

      <div class="card">
        <p class="card-title">QR labels</p>
        <p class="muted" style="margin:0;line-height:1.5">
          Pre-printed QR labels are available for purchase. Use <strong>Photo of bin</strong> if your bins have handwritten labels.
        </p>
      </div>

      <div class="card">
        <p class="card-title">About</p>
        <p class="muted" style="margin:0;line-height:1.5">
          BinBuilder stores everything on your device. Camera access requires HTTPS or localhost.
        </p>
        <p class="muted" style="margin:8px 0 0">Version ${APP_VERSION}</p>
      </div>
    </div>
  `;

  const rerender = () => renderSettings(container);

  async function updateAiStatus() {
    const statusEl = container.querySelector('#ai-status');
    if (!statusEl) return;
    if (!getAiKey()) {
      statusEl.textContent = '';
      return;
    }
    const items = await getAllItems();
    const withPhotos = items.filter((i) => i.imageBlob);
    const named = withPhotos.filter((i) => i.aiLabel !== undefined);
    const err = getLastAiError();
    statusEl.textContent = `${named.length} of ${withPhotos.length} photo items described.`
      + (err ? ` Last error: ${err}` : '');
  }
  updateAiStatus();

  container.querySelector('#btn-ai-save')?.addEventListener('click', async () => {
    const key = container.querySelector('#ai-key').value.trim();
    if (!key) {
      showToast('Paste your OpenRouter key first');
      return;
    }
    setAiKey(key);
    setAiModel(container.querySelector('#ai-model').value);
    showToast('AI descriptions enabled — describing items in the background');
    processPendingItemAi().catch(() => {});
    rerender();
  });

  container.querySelector('#btn-ai-test')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Testing…';
    const result = await testAiKey(getAiKey(), container.querySelector('#ai-model').value.trim() || DEFAULT_AI_MODEL);
    btn.disabled = false;
    btn.textContent = 'Test key';
    showToast(result.ok ? 'Key works ✓' : `Key test failed: ${result.error}`, result.ok ? 2500 : 5000);
  });

  container.querySelector('#btn-ai-remove')?.addEventListener('click', () => {
    if (!confirmDialog('Remove the API key from this device? Existing AI names are kept.')) return;
    removeAiKey();
    showToast('Key removed');
    rerender();
  });

  container.querySelector('#btn-ai-model-save').addEventListener('click', () => {
    setAiModel(container.querySelector('#ai-model').value);
    showToast('Model saved');
    if (getAiKey()) processPendingItemAi().catch(() => {});
  });

  container.querySelector('#btn-export-zip').addEventListener('click', async () => {
    try {
      await exportBackup();
      showToast('Backup downloaded');
    } catch (e) {
      showToast(e.message || 'Export failed');
    }
  });

  container.querySelector('#btn-export-json').addEventListener('click', async () => {
    try {
      await exportJsonOnly();
      showToast('JSON backup downloaded');
    } catch (e) {
      showToast(e.message || 'Export failed');
    }
  });

  container.querySelector('#btn-import').addEventListener('click', async () => {
    const fileInput = container.querySelector('#import-file');
    const file = fileInput.files[0];
    if (!file) {
      showToast('Choose a file first');
      return;
    }

    const mode = container.querySelector('#import-mode').value;
    if (mode === 'replace' && !confirmDialog('This will replace all existing data. Continue?')) {
      return;
    }

    try {
      const result = await importBackupFile(file, mode);
      showToast(`Imported ${result.bins} bins, ${result.items} items`);
      fileInput.value = '';
    } catch (e) {
      showToast(e.message || 'Import failed');
    }
  });
}