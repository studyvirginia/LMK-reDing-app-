/* Backup natural voice: Piper (a small, fast text-to-speech model) running in a background thread.
   Everything it needs is hosted with the app: the phonemizer, the runtime, and the voice. */
import { createPiperPhonemize } from './vendor/piper/phonemizer.js';
import * as ort from './vendor/ort-piper/ort.wasm.min.mjs';

let session = null, cfg = null, phon = null, resolver = null;
let chain = Promise.resolve(); // one request at a time

// download once, then keep in the browser's cache (the model is ~63 MB)
async function cachedBytes(url, onProgress) {
  let cache = null;
  try { cache = await caches.open('piper-v1'); const hit = await cache.match(url); if (hit) return await hit.arrayBuffer(); } catch (e) { cache = null; }
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url.split('/').pop());
  const total = +res.headers.get('content-length') || 0, reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (onProgress && total) onProgress(got / total * 100); }
  const blob = new Blob(parts);
  try { if (cache) await cache.put(url, new Response(blob)); } catch (e) { /* caching is a bonus */ }
  return await blob.arrayBuffer();
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    (async () => {
      try {
        const base = m.base;
        ort.env.wasm.wasmPaths = base + 'vendor/ort-piper/';
        ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) >> 1)) : 1;
        const cfgBytes = await cachedBytes(base + 'models/piper/' + m.voice + '.onnx.json');
        cfg = JSON.parse(new TextDecoder().decode(cfgBytes));
        const model = await cachedBytes(base + 'models/piper/' + m.voice + '.onnx', p => self.postMessage({ type: 'progress', file: 'model.onnx', progress: p }));
        session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        phon = await createPiperPhonemize({
          print: l => { if (resolver) resolver(JSON.parse(l).phoneme_ids); },
          printErr: () => {},
          locateFile: l => l.endsWith('.wasm') ? base + 'vendor/piper/piper_phonemize.wasm' : l.endsWith('.data') ? base + 'vendor/piper/piper_phonemize.data' : l
        });
        self.postMessage({ type: 'source', from: 'this site' });
        self.postMessage({ type: 'ready' });
      } catch (err) { self.postMessage({ type: 'initerror', name: err && err.name, message: String((err && err.message) || err) }); }
    })();
  } else if (m.type === 'gen') {
    chain = chain.catch(() => {}).then(async () => {
      try {
        const t0 = performance.now();
        const ids = await new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error('the phonemizer did not answer')), 8000);
          resolver = v => { clearTimeout(timer); res(v); };
          try { phon.callMain(['-l', cfg.espeak.voice, '--input', JSON.stringify([{ text: m.text }]), '--espeak_data', '/espeak-ng-data']); } catch (err) { clearTimeout(timer); rej(err); }
        });
        let audio;
        if (!ids || !ids.length) audio = new Float32Array(Math.round(cfg.audio.sample_rate * 0.2));
        else {
          const out = await session.run({
            input: new ort.Tensor('int64', ids, [1, ids.length]),
            input_lengths: new ort.Tensor('int64', [ids.length]),
            scales: new ort.Tensor('float32', [cfg.inference.noise_scale, cfg.inference.length_scale, cfg.inference.noise_w])
          });
          audio = new Float32Array(out.output.data); // copy: the runtime owns the original
        }
        self.postMessage({ type: 'audio', id: m.id, audio, rate: cfg.audio.sample_rate, ms: performance.now() - t0 }, [audio.buffer]);
      } catch (err) { self.postMessage({ type: 'error', id: m.id, name: err && err.name, message: String((err && err.message) || err) }); }
    });
  }
};
