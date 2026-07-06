import { blurScoreFromCanvas } from './blur.js';
import { canvasToJpegBlob, wait } from './utils.js';
import {
  SIGNATURE_SIZE,
  signatureFromImageData,
  signatureDistance,
} from './signature.js';

// Captures item frames directly off the live camera preview while the user
// records, instead of parsing a MediaRecorder blob afterwards. Recorded blobs
// have no seek index, so the old post-hoc extraction cost grew quadratically
// with session length — long sessions looked hung on "Extracting frames".
//
// Same capture model as before: while the user is moving (swapping items) the
// signature jumps between consecutive samples; once they hold an item steady
// for a couple of samples, keep one sharp frame of it. Signature dedup
// guarantees at most one kept frame per item, however long they hold it.
export function createLiveCapture(video, options = {}) {
  const {
    sampleIntervalMs = 250,
    motionThreshold = 0.03,
    dupThreshold = 0.05,
    stableSamplesNeeded = 2,
    blurThreshold = 120,
    autoDiscardBlurry = true,
    fallbackIntervalMs = 1000,
    maxFallbackFrames = 60,
    onCapture,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const sigCanvas = document.createElement('canvas');
  sigCanvas.width = SIGNATURE_SIZE;
  sigCanvas.height = SIGNATURE_SIZE;
  const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });

  const frames = [];
  const fallbackFrames = [];
  let running = false;
  let loopDone = null;

  // Try to keep the frame currently on `canvas` in `list`, deduped against
  // the last frame kept in that list.
  function makeKeeper(list) {
    let lastKeptSig = null;
    return async (sig, time) => {
      if (lastKeptSig && signatureDistance(sig, lastKeptSig) < dupThreshold) {
        return 'duplicate';
      }

      const blurScore = blurScoreFromCanvas(canvas);
      const blurry = blurScore < blurThreshold;
      if (autoDiscardBlurry && blurry) return 'blurry';

      const blob = await canvasToJpegBlob(canvas, 0.85);
      list.push({
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
  }

  async function loop() {
    const keepStable = makeKeeper(frames);
    const keepFallback = makeKeeper(fallbackFrames);
    const startedAt = performance.now();
    let prevSig = null;
    let stableRun = 0;
    let nextFallbackTime = 0;

    while (running) {
      const tickStarted = performance.now();

      try {
        if (video.videoWidth && video.videoHeight) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          sigCtx.drawImage(canvas, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
          const sig = signatureFromImageData(
            sigCtx.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE)
          );
          const time = (tickStarted - startedAt) / 1000;

          const moving = prevSig
            ? signatureDistance(sig, prevSig) > motionThreshold
            : false;
          prevSig = sig;

          if (moving) {
            stableRun = 0;
          } else {
            stableRun++;
            if (stableRun >= stableSamplesNeeded) {
              const result = await keepStable(sig, time);
              if (result === 'kept' && onCapture) onCapture(frames.length);
            }
          }

          // Nothing held steady yet (shaky hands, constant motion): also keep
          // a sparser deduped series so stop() can still return something.
          if (
            !frames.length &&
            time >= nextFallbackTime &&
            fallbackFrames.length < maxFallbackFrames
          ) {
            await keepFallback(sig, time);
            nextFallbackTime = time + fallbackIntervalMs / 1000;
          }
        }
      } catch (e) {
        // A bad tick (e.g. the camera track ending mid-sample) must not kill
        // the loop — keep whatever frames we can still collect.
        console.error('live capture sample failed:', e);
      }

      const elapsed = performance.now() - tickStarted;
      await wait(Math.max(16, sampleIntervalMs - elapsed));
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      loopDone = loop();
    },
    // Resolves once the sampler has fully stopped reading from the video.
    async stop() {
      running = false;
      if (loopDone) await loopDone;
      return frames.length ? frames : fallbackFrames;
    },
  };
}
