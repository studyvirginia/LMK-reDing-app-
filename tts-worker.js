/* Natural voice (Kokoro) running in a background thread, so generating speech never freezes the page. */
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

let tts = null;
let chain = Promise.resolve(); // the model can only run one request at a time

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    (async () => {
      try {
        env.wasmPaths = m.wasmPaths; // runtime files are hosted with the app
        tts = await KokoroTTS.from_pretrained(m.model, {
          dtype: m.dtype || 'q8', device: m.device || 'wasm',
          progress_callback: p => { if (p && p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, progress: p.progress }); }
        });
        self.postMessage({ type: 'ready' });
      } catch (err) { self.postMessage({ type: 'initerror', name: err && err.name, message: String((err && err.message) || err) }); }
    })();
  } else if (m.type === 'gen') {
    chain = chain.catch(() => {}).then(async () => {
      try {
        const t0 = performance.now();
        const a = await tts.generate(m.text, { voice: m.voice, speed: 1 });
        const audio = a.audio, rate = a.sampling_rate;
        self.postMessage({ type: 'audio', id: m.id, audio, rate, ms: performance.now() - t0 }, [audio.buffer]);
      } catch (err) { self.postMessage({ type: 'error', id: m.id, name: err && err.name, message: String((err && err.message) || err) }); }
    });
  }
};
