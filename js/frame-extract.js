import { blurScoreFromCanvas } from './blur.js';
import { canvasToJpegBlob } from './utils.js';

function waitForEvent(el, event) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`Video ${event} failed`));
    };
    const cleanup = () => {
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

async function getVideoDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  video.currentTime = 1e10;
  await waitForEvent(video, 'seeked');

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = 0;
  await waitForEvent(video, 'seeked');
  return duration;
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.05) return;
  video.currentTime = time;
  await waitForEvent(video, 'seeked');
}

export const SIGNATURE_SIZE = 16;

// Tiny grayscale fingerprint of a frame, mean-centered so a global exposure
// shift (phone auto-adjusting brightness) doesn't register as new content.
export function signatureFromImageData(imageData) {
  const { data } = imageData;
  const sig = new Float32Array(data.length / 4);
  let mean = 0;

  for (let i = 0; i < sig.length; i++) {
    const j = i * 4;
    sig[i] = (data[j] + data[j + 1] + data[j + 2]) / 3;
    mean += sig[i];
  }

  mean /= sig.length;
  for (let i = 0; i < sig.length; i++) sig[i] -= mean;
  return sig;
}

// Mean absolute difference, normalized to 0..1.
export function signatureDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

export async function extractFrames(videoBlob, options = {}) {
  const {
    intervalSec = 1,
    useSceneChange = true,
    motionThreshold = 0.03,
    dupThreshold = 0.05,
    stableSamplesNeeded = 2,
    blurThreshold = 120,
    autoDiscardBlurry = true,
    onProgress,
  } = options;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const url = URL.createObjectURL(videoBlob);
  video.src = url;

  try {
    await waitForEvent(video, 'loadedmetadata');
    const duration = await getVideoDuration(video);

    if (!duration || duration < 0.3) {
      return [];
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const sigCanvas = document.createElement('canvas');
    sigCanvas.width = SIGNATURE_SIZE;
    sigCanvas.height = SIGNATURE_SIZE;
    const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });

    const drawAt = async (time) => {
      await seekVideo(video, Math.min(time, duration - 0.05));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    };

    const currentSignature = () => {
      sigCtx.drawImage(canvas, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
      return signatureFromImageData(
        sigCtx.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE)
      );
    };

    const frames = [];
    let lastKeptSig = null;

    // Try to keep the frame currently on `canvas`. Returns:
    //  'kept'      — new item, sharp, saved
    //  'duplicate' — same content we already saved; no point retrying
    //  'blurry'    — new content but out of focus; worth retrying later
    const tryKeepCurrent = async (time, sig = currentSignature()) => {
      if (lastKeptSig && signatureDistance(sig, lastKeptSig) < dupThreshold) {
        return 'duplicate';
      }

      const blurScore = blurScoreFromCanvas(canvas);
      const blurry = blurScore < blurThreshold;
      if (autoDiscardBlurry && blurry) return 'blurry';

      const blob = await canvasToJpegBlob(canvas, 0.85);
      frames.push({
        blob,
        time,
        blurScore,
        blurry,
        deleted: false,
        label: '',
      });
      lastKeptSig = sig;
      return 'kept';
    };

    const intervalScan = async (progressFrom) => {
      const count = Math.max(1, Math.floor(duration / intervalSec));
      for (let i = 0; i <= count; i++) {
        const t = Math.min(i * intervalSec, duration - 0.05);
        await drawAt(t);
        await tryKeepCurrent(t);
        if (onProgress) {
          onProgress(progressFrom + (1 - progressFrom) * (i / count));
        }
      }
    };

    if (useSceneChange) {
      // Capture on stability: while the user is moving (swapping items) the
      // signature jumps between consecutive samples; once they hold an item
      // steady for a couple of samples, grab one frame of it. The signature
      // dedup in tryKeepCurrent guarantees at most one kept frame per item,
      // however long they hold it.
      const step = 0.25;
      let prevSig = null;
      let stableRun = 0;

      for (let t = 0; t < duration; t += step) {
        await drawAt(t);
        const sig = currentSignature();
        const moving = prevSig
          ? signatureDistance(sig, prevSig) > motionThreshold
          : false;
        prevSig = sig;

        if (moving) {
          stableRun = 0;
        } else {
          stableRun++;
          if (stableRun >= stableSamplesNeeded) {
            await tryKeepCurrent(t, sig);
          }
        }

        if (onProgress) onProgress(Math.min(0.8, (t / duration) * 0.8));
      }

      // Nothing held steady long enough (shaky hands, constant motion):
      // fall back to sampling at a fixed interval, still deduped.
      if (!frames.length) {
        await intervalScan(0.8);
      }
    } else {
      await intervalScan(0);
    }

    if (onProgress) onProgress(1);
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
}
