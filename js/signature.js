export const SIGNATURE_SIZE = 16;

// Tiny RGB fingerprint of a frame: SIGNATURE_SIZE² cells × 3 channels, each
// channel mean-centered so a global exposure or white-balance shift (phone
// auto-adjusting) doesn't register as new content. Color matters: two
// different items can have near-identical grayscale luminance (blue vs pink
// plastic) while differing strongly per channel.
export function signatureFromImageData(imageData) {
  const { data } = imageData;
  const cells = data.length / 4;
  const sig = new Float32Array(cells * 3);
  const means = [0, 0, 0];

  for (let i = 0; i < cells; i++) {
    for (let c = 0; c < 3; c++) {
      const v = data[i * 4 + c];
      sig[i * 3 + c] = v;
      means[c] += v;
    }
  }

  for (let c = 0; c < 3; c++) means[c] /= cells;
  for (let i = 0; i < cells; i++) {
    for (let c = 0; c < 3; c++) sig[i * 3 + c] -= means[c];
  }
  return sig;
}

// Mean absolute difference across all cells and channels, normalized to 0..1.
export function signatureDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

// Fraction of signature cells where any channel changed by more than
// cellThreshold levels. Distinguishes a localized change (one more item now
// visible in the bin: few cells change, channel means barely move) from a
// genuinely new scene (an item filling the frame: its cells change AND its
// color drags the channel means, pushing background cells past the threshold
// too). Both failure directions are safe — over-counting change only means a
// capture is allowed. No extra alignment beyond mean-centering: aligning by
// e.g. the median difference would let a large uniform item cancel the color
// difference between itself and another item held in the same spot.
export function changedCellFraction(a, b, cellThreshold = 25) {
  const cells = a.length / 3;
  let changed = 0;
  for (let i = 0; i < cells; i++) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs(a[i * 3 + c] - b[i * 3 + c]) > cellThreshold) {
        changed++;
        break;
      }
    }
  }
  return changed / cells;
}
