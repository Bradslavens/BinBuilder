import { describe, it, expect } from 'vitest';
import {
  SIGNATURE_SIZE,
  signatureFromImageData,
  signatureDistance,
} from '../js/signature.js';

// Build a fake ImageData-shaped object from a per-pixel grayscale function.
function fakeImageData(pixelFn) {
  const n = SIGNATURE_SIZE * SIGNATURE_SIZE;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i % SIGNATURE_SIZE;
    const y = Math.floor(i / SIGNATURE_SIZE);
    const v = pixelFn(x, y);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: SIGNATURE_SIZE, height: SIGNATURE_SIZE };
}

describe('signatureFromImageData', () => {
  it('is mean-centered', () => {
    const sig = signatureFromImageData(fakeImageData(() => 200));
    const sum = sig.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-3);
  });
});

describe('signatureDistance', () => {
  it('is zero for identical frames', () => {
    const a = signatureFromImageData(fakeImageData((x, y) => (x * y * 7) % 256));
    const b = signatureFromImageData(fakeImageData((x, y) => (x * y * 7) % 256));
    expect(signatureDistance(a, b)).toBe(0);
  });

  it('ignores a global brightness shift (auto-exposure)', () => {
    const pattern = (x, y) => 60 + ((x + y) % 2) * 100;
    const a = signatureFromImageData(fakeImageData(pattern));
    const b = signatureFromImageData(fakeImageData((x, y) => pattern(x, y) + 40));
    expect(signatureDistance(a, b)).toBeLessThan(0.01);
  });

  it('is small for the same content with slight jitter', () => {
    // Hand jitter after downscaling to 16x16 looks like small per-pixel
    // noise, not a whole-pixel shift of the signature grid.
    const pattern = (x, y) => (x < SIGNATURE_SIZE / 2 ? 40 : 220) + (y % 3);
    const noise = (x, y) => ((x * 31 + y * 17) % 11) - 5;
    const a = signatureFromImageData(fakeImageData(pattern));
    const b = signatureFromImageData(
      fakeImageData((x, y) => pattern(x, y) + noise(x, y))
    );
    expect(signatureDistance(a, b)).toBeLessThan(0.05);
  });

  it('is large for genuinely different content', () => {
    // Left-half bright vs top-half bright: different item in frame.
    const a = signatureFromImageData(
      fakeImageData((x) => (x < SIGNATURE_SIZE / 2 ? 230 : 30))
    );
    const b = signatureFromImageData(
      fakeImageData((x, y) => (y < SIGNATURE_SIZE / 2 ? 230 : 30))
    );
    expect(signatureDistance(a, b)).toBeGreaterThan(0.05);
  });
});
