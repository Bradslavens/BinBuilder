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
