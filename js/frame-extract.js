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

function histogramDiff(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const bins = 32;
  const hist = new Float32Array(bins);
  let pixels = 0;

  for (let i = 0; i < data.length; i += 16) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const bin = Math.min(bins - 1, Math.floor((lum / 255) * bins));
    hist[bin]++;
    pixels++;
  }

  if (pixels === 0) return hist;
  for (let i = 0; i < bins; i++) hist[i] /= pixels;
  return hist;
}

function histDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

export async function extractFrames(videoBlob, options = {}) {
  const {
    intervalSec = 1,
    useSceneChange = true,
    sceneThreshold = 0.18,
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
    const frames = [];
    let prevHist = null;

    const captureAt = async (time) => {
      await seekVideo(video, Math.min(time, duration - 0.05));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      const blurScore = blurScoreFromCanvas(canvas);
      const blurry = blurScore < blurThreshold;

      if (autoDiscardBlurry && blurry) return null;

      const blob = await canvasToJpegBlob(canvas, 0.85);
      return {
        blob,
        time,
        blurScore,
        blurry,
        deleted: false,
        label: '',
      };
    };

    if (useSceneChange) {
      const step = 0.25;
      for (let t = 0; t < duration; t += step) {
        await seekVideo(video, t);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const hist = histogramDiff(ctx, canvas.width, canvas.height);
        const changed = !prevHist || histDistance(prevHist, hist) > sceneThreshold;

        if (changed) {
          const frame = await captureAt(t);
          if (frame) frames.push(frame);
          prevHist = hist;
        }

        if (onProgress) onProgress(Math.min(1, t / duration));
      }
    } else {
      const count = Math.max(1, Math.floor(duration / intervalSec));
      for (let i = 0; i <= count; i++) {
        const t = Math.min(i * intervalSec, duration - 0.05);
        const frame = await captureAt(t);
        if (frame) frames.push(frame);
        if (onProgress) onProgress(i / count);
      }
    }

    if (onProgress) onProgress(1);
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
}