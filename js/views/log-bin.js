import { hideChrome, navigate, showToast } from '../app.js';
import { createBinFromQr, createBinFromPhoto, addItemsToBin } from '../db.js';
import { startCamera, stopCamera, capturePhotoFromVideo } from '../camera.js';
import { startQrScanLoop } from '../qr-scan.js';
import { recognizeTextFromBlob } from '../ocr.js';
import { createThumbnail, resizeImageBlob } from '../thumbnails.js';
import { createRecorder } from '../recorder.js';
import { extractFrames } from '../frame-extract.js';
import { playScanSuccess, playSaveSuccess, vibrateSuccess } from '../audio.js';
import { blobToObjectUrl, confirmDialog, escapeHtml, wait } from '../utils.js';

let cleanupFns = [];

function addCleanup(fn) {
  cleanupFns.push(fn);
}

function runCleanup() {
  cleanupFns.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  cleanupFns = [];
  stopCamera();
}

export function startLogBin(existingBinId = null) {
  runCleanup();
  hideChrome();

  if (existingBinId) {
    startRecordingForBin(existingBinId);
    return;
  }

  showEntryChoice();
}

function showEntryChoice() {
  const overlay = document.createElement('div');
  overlay.className = 'camera-view';
  overlay.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px;gap:16px;background:var(--bg)">
      <h2 style="margin:0;text-align:center">Log a bin</h2>
      <p class="muted" style="text-align:center;margin:0">How do you want to identify this bin?</p>
      <button type="button" class="btn btn-primary" id="btn-photo-bin">📷 Photo of bin</button>
      <button type="button" class="btn btn-secondary" id="btn-scan-qr">Scan QR label</button>
      <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  addCleanup(() => overlay.remove());

  overlay.querySelector('#btn-photo-bin').addEventListener('click', () => {
    overlay.remove();
    startPhotoCapture();
  });

  overlay.querySelector('#btn-scan-qr').addEventListener('click', () => {
    overlay.remove();
    startQrScan();
  });

  overlay.querySelector('#btn-cancel').addEventListener('click', () => {
    runCleanup();
    navigate('home');
  });
}

async function startQrScan() {
  const overlay = buildCameraOverlay({
    hint: 'Point camera at the bin QR label',
    showScanFrame: true,
    cancelLabel: 'Cancel',
  });

  const { video, flashEl } = overlay;

  try {
    await startCamera(video);
  } catch (e) {
    showPermissionError(e.message);
    runCleanup();
    navigate('home');
    return;
  }

  const stopScan = startQrScanLoop(video, async (binId) => {
    playScanSuccess();
    vibrateSuccess(200);
    flashEl.classList.add('flash-success');
    await wait(350);
    flashEl.classList.remove('flash-success');

    const bin = await createBinFromQr(binId);
    stopScan();
    overlay.remove();
    cleanupFns = cleanupFns.filter((f) => f !== stopScan);
    stopCamera();
    showStartRecording(bin.id, null);
  });

  addCleanup(stopScan);
}

async function startPhotoCapture() {
  const overlay = buildCameraOverlay({
    hint: 'Center the bin label in view, then tap Take Photo',
    captureLabel: '📷 Take Photo',
    cancelLabel: 'Cancel',
  });

  const { video } = overlay;

  // Keep capture disabled until the camera is actually producing frames, so
  // neither the user nor an automated test can trigger a capture before the
  // video has real dimensions.
  overlay.captureBtn.disabled = true;
  const originalCaptureLabel = overlay.captureBtn.textContent;
  overlay.captureBtn.textContent = 'Starting camera…';

  try {
    await startCamera(video);
  } catch (e) {
    showPermissionError(e.message);
    runCleanup();
    navigate('home');
    return;
  }

  await waitForVideoReady(video);
  overlay.captureBtn.textContent = originalCaptureLabel;
  overlay.captureBtn.disabled = false;

  overlay.captureBtn.addEventListener('click', async () => {
    overlay.captureBtn.disabled = true;
    overlay.captureBtn.textContent = 'Capturing…';

    // The video may not have reported dimensions yet on slower devices.
    for (let i = 0; i < 20 && !video.videoWidth; i++) {
      await wait(100);
    }

    try {
      const photoBlob = await capturePhotoFromVideo(video);
      stopCamera();
      overlay.remove();
      await showPhotoConfirm(photoBlob);
    } catch (e) {
      showToast(e.message || 'Capture failed — try again');
      overlay.captureBtn.disabled = false;
      overlay.captureBtn.textContent = originalCaptureLabel;
    }
  });
}

// Resolve once the video reports real dimensions (or after a timeout so we
// never hang the UI forever).
async function waitForVideoReady(video, timeoutMs = 5000) {
  const deadline = timeoutMs / 100;
  for (let i = 0; i < deadline && !video.videoWidth; i++) {
    await wait(100);
  }
}

// Step 2: confirm the single still photo. OCR runs in the background and
// pre-fills the description without ever blocking the confirm button.
async function showPhotoConfirm(photoBlob) {
  const resized = await resizeImageBlob(photoBlob, 1280);
  const previewUrl = blobToObjectUrl(resized);

  const overlay = document.createElement('div');
  overlay.className = 'camera-view';
  overlay.style.background = 'var(--bg)';
  overlay.innerHTML = `
    <div style="flex:1;overflow:auto;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom))">
      <h2 style="margin:0 0 12px">Confirm bin photo</h2>
      <img class="capture-preview" src="${previewUrl}" alt="Bin photo">
      <div class="label-field">
        <label for="bin-description">Description (optional)</label>
        <textarea class="text-area" id="bin-description" placeholder="Name this bin, or leave blank"></textarea>
        <div id="ocr-status" class="muted" style="margin-top:4px;font-size:0.85rem">Reading any text…</div>
      </div>
      <button type="button" class="btn btn-primary" id="btn-use-photo">✓ Use This Photo</button>
      <button type="button" class="btn btn-secondary" id="btn-retake" style="margin-top:8px">↺ Retake Photo</button>
      <button type="button" class="btn btn-secondary" id="btn-cancel-photo" style="margin-top:8px">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  addCleanup(() => {
    URL.revokeObjectURL(previewUrl);
    overlay.remove();
  });

  const statusEl = overlay.querySelector('#ocr-status');
  const descEl = overlay.querySelector('#bin-description');
  const useBtn = overlay.querySelector('#btn-use-photo');

  // Non-blocking OCR: the user can proceed immediately; if text is found and
  // they haven't typed anything, we fill it in.
  recognizeTextFromBlob(resized, (msg) => { statusEl.textContent = msg; })
    .then((text) => {
      if (text && !descEl.value.trim()) descEl.value = text;
      statusEl.textContent = text ? 'Detected text added — edit if needed' : 'No text detected';
    })
    .catch(() => {
      statusEl.textContent = 'Text recognition unavailable — type a description if you like';
    });

  useBtn.addEventListener('click', async () => {
    useBtn.disabled = true;
    useBtn.textContent = 'Saving…';
    const description = descEl.value;
    const thumb = await createThumbnail(resized);
    const bin = await createBinFromPhoto({
      description,
      binPhotoBlob: resized,
      binPhotoThumbnail: thumb,
    });
    URL.revokeObjectURL(previewUrl);
    overlay.remove();
    showStartRecording(bin.id, blobToObjectUrl(thumb));
  });

  overlay.querySelector('#btn-retake').addEventListener('click', () => {
    URL.revokeObjectURL(previewUrl);
    overlay.remove();
    startPhotoCapture();
  });

  overlay.querySelector('#btn-cancel-photo').addEventListener('click', () => {
    runCleanup();
    navigate('home');
  });
}

// Step 3: bin exists — offer to start recording items, or skip.
function showStartRecording(binId, thumbUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'camera-view';
  overlay.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px;gap:16px;background:var(--bg);text-align:center">
      <div style="font-size:2rem">✅</div>
      <h2 style="margin:0">Bin saved</h2>
      ${thumbUrl ? `<img src="${thumbUrl}" alt="Bin" style="width:120px;height:120px;object-fit:cover;border-radius:12px;align-self:center">` : ''}
      <p class="muted" style="margin:0">Next, record a short video while you add items. Hold each item steady in front of the camera for a second, then tap Done when finished.</p>
      <button type="button" class="btn btn-primary" id="btn-start-items">▶ Start Adding Items</button>
      <button type="button" class="btn btn-secondary" id="btn-skip-items">Skip for now</button>
    </div>
  `;

  document.body.appendChild(overlay);
  addCleanup(() => {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    overlay.remove();
  });

  overlay.querySelector('#btn-start-items').addEventListener('click', () => {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    overlay.remove();
    startRecordingForBin(binId);
  });

  overlay.querySelector('#btn-skip-items').addEventListener('click', () => {
    runCleanup();
    showToast('Bin saved');
    navigate('bin-detail', { id: binId });
  });
}

async function startRecordingForBin(binId, existingVideo = null) {
  const overlay = buildCameraOverlay({
    hint: 'Hold each item steady for a second, then set it in the bin',
    recording: true,
    doneLabel: '✓ Done Adding Items',
    cancelLabel: 'Cancel',
  });

  const { video, stopBtn, recordingBar } = overlay;

  try {
    if (existingVideo?.srcObject) {
      video.srcObject = existingVideo.srcObject;
      await video.play();
    } else {
      await startCamera(video);
    }
  } catch (e) {
    showPermissionError(e.message);
    runCleanup();
    navigate('home');
    return;
  }

  const stream = video.srcObject;
  let recorderWrap;

  try {
    recorderWrap = createRecorder(stream);
    recorderWrap.start();
  } catch (e) {
    showToast(e.message);
    runCleanup();
    navigate('home');
    return;
  }

  recordingBar.classList.remove('hidden');
  stopBtn.classList.remove('hidden');

  const cancelRecording = async () => {
    if (!confirmDialog('Discard this recording?')) return;
    await recorderWrap.stop();
    runCleanup();
    navigate('bin-detail', { id: binId });
  };

  overlay.cancelBtn.addEventListener('click', cancelRecording);

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    recordingBar.classList.add('hidden');

    const processing = showProcessing('Processing video…');
    try {
      const blob = await recorderWrap.stop();
      stopCamera();
      overlay.remove();

      processing.update('Extracting frames…');
      const frames = await extractFrames(blob, {
        useSceneChange: true,
        autoDiscardBlurry: true,
        onProgress: (p) => {
          processing.update(`Extracting frames… ${Math.round(p * 100)}%`);
        },
      });

      processing.remove();

      if (!frames.length) {
        showToast('No usable frames found. Try recording again with steadier hands.');
        runCleanup();
        navigate('bin-detail', { id: binId });
        return;
      }

      await showReviewGrid(binId, frames);
    } catch (e) {
      processing.remove();
      showToast(e.message || 'Processing failed');
      runCleanup();
      navigate('home');
    }
  });
}

async function showReviewGrid(binId, frames) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:300;overflow:auto;padding:16px;padding-bottom:calc(80px + env(safe-area-inset-bottom))';

  const activeFrames = frames.map((f, i) => ({ ...f, index: i, deleted: false }));

  function render() {
    const kept = activeFrames.filter((f) => !f.deleted);
    overlay.innerHTML = `
      <div class="review-meta">
        <span class="review-count">${kept.length} item${kept.length === 1 ? '' : 's'} selected</span>
        <span class="muted">Tap to remove</span>
      </div>
      <div class="photo-grid" id="review-grid"></div>
      <button type="button" class="btn btn-primary" id="btn-save" style="margin-top:16px" ${kept.length ? '' : 'disabled'}>Save items</button>
      <button type="button" class="btn btn-secondary" id="btn-discard" style="margin-top:8px">Discard</button>
    `;

    const grid = overlay.querySelector('#review-grid');

    activeFrames.forEach((frame) => {
      const url = blobToObjectUrl(frame.blob);
      const cell = document.createElement('div');
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `photo-grid-item${frame.deleted ? ' deleted' : ''}`;
      btn.innerHTML = `
        <img src="${url}" alt="">
        ${frame.deleted ? '<span class="delete-badge">OUT</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        frame.deleted = !frame.deleted;
        render();
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'frame-label-input';
      input.placeholder = 'Label (optional)';
      input.value = frame.label || '';
      input.disabled = frame.deleted;
      input.addEventListener('input', () => {
        frame.label = input.value;
      });

      cell.appendChild(btn);
      cell.appendChild(input);
      grid.appendChild(cell);
    });

    overlay.querySelector('#btn-save').addEventListener('click', async () => {
      const keptFrames = activeFrames.filter((f) => !f.deleted);
      if (!keptFrames.length) return;

      const saveBtn = overlay.querySelector('#btn-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      const itemData = [];
      for (const frame of keptFrames) {
        const thumbnailBlob = await createThumbnail(frame.blob);
        itemData.push({
          imageBlob: frame.blob,
          thumbnailBlob,
          label: frame.label || '',
        });
      }

      await addItemsToBin(binId, itemData);
      playSaveSuccess();
      vibrateSuccess([100, 50, 100]);

      overlay.remove();
      runCleanup();
      showToast('Items saved');
      navigate('bin-detail', { id: binId });
    });

    overlay.querySelector('#btn-discard').addEventListener('click', () => {
      if (!confirmDialog('Discard these frames?')) return;
      overlay.remove();
      runCleanup();
      navigate('bin-detail', { id: binId });
    });
  }

  document.body.appendChild(overlay);
  addCleanup(() => overlay.remove());
  render();
}

function buildCameraOverlay({ hint, showScanFrame = false, recording = false, captureLabel, doneLabel = 'Done', cancelLabel = 'Cancel' }) {
  const overlay = document.createElement('div');
  overlay.className = 'camera-view';
  overlay.innerHTML = `
    <video class="camera-video" playsinline muted autoplay></video>
    <div class="camera-overlay" id="flash-overlay"></div>
    ${showScanFrame ? '<div class="scan-frame"></div>' : ''}
    <div class="recording-bar hidden" id="recording-bar">
      <span class="recording-dot"></span>
      <span class="recording-label">RECORDING</span>
    </div>
    <div class="camera-controls">
      <p class="camera-hint">${escapeHtml(hint)}</p>
      ${captureLabel ? `<button type="button" class="btn btn-primary btn-capture" id="btn-capture">${escapeHtml(captureLabel)}</button>` : ''}
      <button type="button" class="btn btn-danger btn-stop hidden" id="btn-stop">${escapeHtml(doneLabel)}</button>
      <button type="button" class="btn btn-secondary" id="btn-cancel">${escapeHtml(cancelLabel)}</button>
    </div>
  `;

  document.body.appendChild(overlay);
  addCleanup(() => overlay.remove());

  return {
    overlay,
    video: overlay.querySelector('video'),
    flashEl: overlay.querySelector('#flash-overlay'),
    recordingBar: overlay.querySelector('#recording-bar'),
    stopBtn: overlay.querySelector('#btn-stop'),
    cancelBtn: overlay.querySelector('#btn-cancel'),
    captureBtn: overlay.querySelector('#btn-capture'),
    remove: () => overlay.remove(),
  };
}

function showProcessing(message) {
  const el = document.createElement('div');
  el.className = 'processing-overlay';
  el.innerHTML = `<div class="spinner"></div><p id="proc-msg" style="margin:0;text-align:center">${escapeHtml(message)}</p>`;
  document.body.appendChild(el);

  return {
    update(msg) {
      el.querySelector('#proc-msg').textContent = msg;
    },
    remove() {
      el.remove();
    },
  };
}

function showPermissionError(message) {
  const el = document.createElement('div');
  el.className = 'alert';
  el.style.cssText = 'position:fixed;left:16px;right:16px;top:16px;z-index:700';
  el.innerHTML = `
    <strong>Camera access needed</strong><br>
    ${escapeHtml(message || 'Please allow camera access in your browser settings.')}
    <br><br>
    <span class="muted">Camera requires HTTPS or localhost.</span>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}
