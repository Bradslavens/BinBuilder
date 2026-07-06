import { describe, it, expect } from 'vitest';
import {
  SIGNATURE_SIZE,
  signatureFromImageData,
  signatureDistance,
  changedCellFraction,
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

// Same, but pixelFn returns [r, g, b].
function fakeColorImageData(pixelFn) {
  const n = SIGNATURE_SIZE * SIGNATURE_SIZE;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i % SIGNATURE_SIZE;
    const y = Math.floor(i / SIGNATURE_SIZE);
    const [r, g, b] = pixelFn(x, y);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
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

describe('changedCellFraction', () => {
  it('is zero for identical frames', () => {
    const pattern = (x, y) => (x * y * 7) % 256;
    const a = signatureFromImageData(fakeImageData(pattern));
    const b = signatureFromImageData(fakeImageData(pattern));
    expect(changedCellFraction(a, b)).toBe(0);
  });

  it('is small when only a corner of the scene changed (item set into bin)', () => {
    const base = (x, y) => 40 + ((x + y) % 4) * 10;
    const a = signatureFromImageData(fakeImageData(base));
    // A 3x3 patch (~3.5% of cells) turns bright: one more item in the bin.
    const b = signatureFromImageData(
      fakeImageData((x, y) => (x < 3 && y < 3 ? 230 : base(x, y)))
    );
    expect(changedCellFraction(a, b)).toBeLessThan(0.1);
  });

  it('is large when a new item fills the frame', () => {
    const a = signatureFromImageData(fakeImageData((x, y) => 40 + ((x + y) % 4) * 10));
    // Bright object covering the middle two thirds of the frame.
    const third = SIGNATURE_SIZE / 3;
    const b = signatureFromImageData(
      fakeImageData((x, y) =>
        x > third && x < 2 * third + third && y > 1 ? 220 : 40
      )
    );
    expect(changedCellFraction(a, b)).toBeGreaterThan(0.3);
  });

  it('ignores a global brightness shift on mean-centered signatures', () => {
    const pattern = (x, y) => 60 + ((x + y) % 2) * 100;
    const a = signatureFromImageData(fakeImageData(pattern));
    const b = signatureFromImageData(fakeImageData((x, y) => pattern(x, y) + 40));
    expect(changedCellFraction(a, b)).toBe(0);
  });

  it('detects a color change even at near-identical brightness', () => {
    // Blue item swapped for a pink one of similar luminance, held in the same
    // spot over the same background — a grayscale signature barely sees this.
    const bg = [119, 119, 119];
    const a = signatureFromImageData(
      fakeColorImageData((x, y) => (y < SIGNATURE_SIZE * 0.6 ? [122, 192, 232] : bg))
    );
    const b = signatureFromImageData(
      fakeColorImageData((x, y) => (y < SIGNATURE_SIZE * 0.6 ? [232, 122, 160] : bg))
    );
    expect(signatureDistance(a, b)).toBeGreaterThan(0.05);
    expect(changedCellFraction(a, b)).toBeGreaterThan(0.3);
  });

  it('is large for a bright item that drags the scene mean toward itself', () => {
    // Item covers 60% of the frame at +45 brightness over a flat background.
    // Mean-centering absorbs ~27 of that 45 in the item region, but the same
    // shift pushes the background cells past the threshold instead — a
    // frame-filling item must always read as a big change.
    const a = signatureFromImageData(fakeImageData(() => 100));
    const b = signatureFromImageData(
      fakeImageData((x, y) => (y < SIGNATURE_SIZE * 0.6 ? 145 : 100))
    );
    expect(changedCellFraction(a, b)).toBeGreaterThan(0.3);
  });
});
