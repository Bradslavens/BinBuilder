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
      <button type="button" class="btn btn-primary" id="btn-scan-qr">Scan QR label</button>
      <button type="button" class="btn btn-secondary" id="btn-photo-bin">Photo of bin</button>
      <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  addCleanup(() => overlay.remove());

  overlay.querySelector('#btn-scan-qr').addEventListener('click', () => {
    overlay.remove();
    cleanupFns = cleanupFns.filter((fn) => fn !== (() => overlay.remove()));
    startQrScan();
  });

  overlay.querySelector('#btn-photo-bin').addEventListener('click', () => {
    overlay.remove();
    cleanupFns = cleanupFns.filter((fn) => fn !== (() => overlay.remove()));
    startPhotoCapture();
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
    startRecordingForBin(bin.id, video);
  });

  addCleanup(stopScan);
}

async function startPhotoCapture() {
  const overlay = buildCameraOverlay({
    hint: 'Photograph the bin label or markings',
    captureLabel: 'Take photo',
    cancelLabel: 'Cancel',
  });

  const { video } = overlay;

  try {
    await startCamera(video);
  } catch (e) {
    showPermissionError(e.message);
    runCleanup();
    navigate('home');
    return;
  }

  overlay.captureBtn.addEventListener('click', async () => {
    overlay.captureBtn.disabled = true;
    try {
      const photoBlob = await capturePhotoFromVideo(video);
      stopCamera();
      overlay.remove();
      await showPhotoReview(photoBlob);
    } catch (e) {
      showToast(e.message || 'Capture failed');
      overlay.captureBtn.disabled = false;
    }
  });
}

async function showPhotoReview(photoBlob) {
  const resized = await resizeImageBlob(photoBlob, 1280);
  const previewUrl = blobToObjectUrl(resized);

  const overlay = document.createElement('div');
  overlay.className = 'camera-view';
  overlay.style.background = 'var(--bg)';
  overlay.innerHTML = `
    <div style="flex:1;overflow:auto;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom))">
      <h2 style="margin:0 0 12px">Bin photo</h2>
      <img class="capture-preview" src="${previewUrl}" alt="Bin photo">
      <div id="ocr-status" class="muted" style="margin-bottom:12px">Reading text…</div>
      <div class="label-field">
        <label for="bin-description">Description</label>
        <textarea class="text-area" id="bin-description" placeholder="Detected text will appear here"></textarea>
      </div>
      <button type="button" class="btn btn-primary" id="btn-continue" disabled>Continue to recording</button>
      <button type="button" class="btn btn-secondary" id="btn-retake" style="margin-top:8px">Retake photo</button>
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
  const continueBtn = overlay.querySelector('#btn-continue');

  try {
    const text = await recognizeTextFromBlob(resized, (msg) => {
      statusEl.textContent = msg;
    });
    descEl.value = text;
    statusEl.textContent = text ? 'Text detected — edit if needed' : 'No text detected — add a description or leave blank';
  } catch (e) {
    statusEl.textContent = 'Text recognition unavailable — add a description manually or leave blank';
  }

  continueBtn.disabled = false;

  continueBtn.addEventListener('click', async () => {
    continueBtn.disabled = true;
    const description = descEl.value;
    const thumb = await createThumbnail(resized);
    const bin = await createBinFromPhoto({
      description,
      binPhotoBlob: resized,
      binPhotoThumbnail: thumb,
    });
    overlay.remove();
    startRecordingForBin(bin.id);
  });

  overlay.querySelector('#btn-retake').addEventListener('click', () => {
    overlay.remove();
    startPhotoCapture();
  });

  overlay.querySelector('#btn-cancel-photo').addEventListener('click', () => {
    runCleanup();
    navigate('home');
  });
}

async function startRecordingForBin(binId, existingVideo = null) {
  const overlay = buildCameraOverlay({
    hint: 'Hold each item in front of the camera, then drop it in the bin',
    recording: true,
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
    navigate('bins');
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
        <span class="review-count">${kept.length} frame${kept.length === 1 ? '' : 's'} selected</span>
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

function buildCameraOverlay({ hint, showScanFrame = false, recording = false, captureLabel, cancelLabel = 'Cancel' }) {
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
      ${captureLabel ? `<button type="button" class="btn btn-primary" id="btn-capture">${escapeHtml(captureLabel)}</button>` : ''}
      <button type="button" class="btn btn-danger btn-stop hidden" id="btn-stop">STOP</button>
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