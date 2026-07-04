export function laplacianVariance(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let lap = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          lap += gray[idx] * kernel[ki++];
        }
      }
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function isBlurry(imageData, threshold = 120) {
  return laplacianVariance(imageData) < threshold;
}

export function blurScoreFromCanvas(canvas, sampleWidth = 320) {
  const scale = Math.min(1, sampleWidth / canvas.width);
  const sw = Math.max(1, Math.round(canvas.width * scale));
  const sh = Math.max(1, Math.round(canvas.height * scale));

  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const ctx = sample.getContext('2d');
  ctx.drawImage(canvas, 0, 0, sw, sh);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  return laplacianVariance(imageData);
}