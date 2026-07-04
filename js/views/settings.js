import { exportBackup, exportJsonOnly, importBackupFile } from '../export-import.js';
import { showToast } from '../app.js';
import { confirmDialog } from '../utils.js';

export function renderSettings(container) {
  container.innerHTML = `
    <div class="stack">
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
      </div>
    </div>
  `;

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