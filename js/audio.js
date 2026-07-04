let audioCtx;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone({ frequency, duration, type = 'sine', gain = 0.3 }) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio unavailable
  }
}

export function playScanSuccess() {
  playTone({ frequency: 880, duration: 0.12, type: 'square', gain: 0.2 });
  setTimeout(() => playTone({ frequency: 1175, duration: 0.15, type: 'square', gain: 0.2 }), 100);
}

export function playSaveSuccess() {
  playTone({ frequency: 523, duration: 0.1, type: 'sine', gain: 0.25 });
  setTimeout(() => playTone({ frequency: 659, duration: 0.1, type: 'sine', gain: 0.25 }), 90);
  setTimeout(() => playTone({ frequency: 784, duration: 0.18, type: 'sine', gain: 0.25 }), 180);
}

export function vibrateSuccess(pattern = 200) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}