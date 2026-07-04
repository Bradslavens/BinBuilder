export function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function createRecorder(stream) {
  if (!window.MediaRecorder) {
    throw new Error('Video recording is not supported in this browser.');
  }

  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : undefined;
  const recorder = new MediaRecorder(stream, options);
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return {
    recorder,
    start() {
      chunks.length = 0;
      recorder.start(1000);
    },
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          const type = mimeType || chunks[0]?.type || 'video/webm';
          resolve(new Blob(chunks, { type }));
        };
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
      });
    },
  };
}