import { blurScoreFromCanvas } from './blur.js';
import { canvasToJpegBlob, wait } from './utils.js';
import {
  SIGNATURE_SIZE,
  signatureFromImageData,
  signatureDistance,
  changedCellFraction,
} from './signature.js';

// Captures item frames directly off the live camera preview while the user
// records, instead of parsing a MediaRecorder blob afterwards. Recorded blobs
// have no seek index, so the old post-hoc extraction cost grew quadratically
// with session length — long sessions looked hung on "Extracting frames".
//
// Capture model: while the user is moving (swapping items) the signature
// jumps between consecutive samples; once they hold an item steady for a
// couple of samples, keep one sharp frame of it. Each steady hold captures at
// most once (drift within a hold must not re-trigger), and a candidate is
// rejected when it matches ANY previously kept frame — either nearly
// identical (the background seen again between items) or differing only in a
// small region (the bin scene after one more item was set into it).
export function createLiveCapture(video, options = {}) {
  const {
    sampleIntervalMs = 250,
    motionThreshold = 0.03,
    dupThreshold = 0.05,
    minChangedFraction = 0.12,
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
  const keptSigs = [];
  const fallbackFrames = [];
  let running = false;
  let loopDone = null;

  // Same content as an earlier capture: nearly identical overall, or only a
  // small part of the frame changed (item added to an already-captured scene).
  const matchesKeptFrame = (sig) =>
    keptSigs.some(
      (kept) =>
        signatureDistance(sig, kept) < dupThreshold ||
        changedCellFraction(sig, kept) < minChangedFraction
    );

  const snapshotFrame = async (time) => {
    const blurScore = blurScoreFromCanvas(canvas);
    const blurry = blurScore < blurThreshold;
    if (autoDiscardBlurry && blurry) return null;

    const blob = await canvasToJpegBlob(canvas, 0.85);
    return { blob, time, blurScore, blurry, deleted: false, label: '' };
  };

  async function loop() {
    const startedAt = performance.now();
    let prevSig = null;
    let stableRun = 0;
    let capturedThisHold = false;
    let lastFallbackSig = null;
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
            capturedThisHold = false;
          } else {
            stableRun++;
            if (!capturedThisHold && stableRun >= stableSamplesNeeded) {
              if (matchesKeptFrame(sig)) {
                capturedThisHold = true;
              } else {
                // A blurry sample is retried next tick — autofocus may still
                // be settling on the newly raised item.
                const frame = await snapshotFrame(time);
                if (frame) {
                  frames.push(frame);
                  keptSigs.push(sig);
                  capturedThisHold = true;
                  if (onCapture) onCapture(frames.length);
                }
              }
            }
          }

          // Nothing held steady yet (shaky hands, constant motion): also keep
          // a sparser deduped series so stop() can still return something.
          if (
            !frames.length &&
            time >= nextFallbackTime &&
            fallbackFrames.length < maxFallbackFrames &&
            !(lastFallbackSig && signatureDistance(sig, lastFallbackSig) < dupThreshold)
          ) {
            const frame = await snapshotFrame(time);
            if (frame) {
              fallbackFrames.push(frame);
              lastFallbackSig = sig;
              nextFallbackTime = time + fallbackIntervalMs / 1000;
            }
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
