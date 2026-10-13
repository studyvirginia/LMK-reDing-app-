/* The natural voice (Kokoro) normally downloads its model from huggingface.co. We host a copy next to the app
   (models/kokoro/), so this redirects those downloads to our own site first and only falls back to huggingface.co
   if our copy is missing. That removes the outside website as a single point of failure. */
const HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';

export function installModelRedirect(base, onSource) {
  const realFetch = globalThis.fetch.bind(globalThis);
  const local = new URL('models/kokoro/', base).href;
  globalThis.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.startsWith(HF)) {
      const rel = url.slice(HF.length).split('?')[0];
      try {
        const r = await realFetch(local + rel, init);
        if (r.ok) { if (onSource) onSource(rel, 'this site'); return r; }
      } catch (e) { /* fall through to huggingface.co */ }
      if (onSource) onSource(rel, 'huggingface.co');
    }
    return realFetch(input, init);
  };
}
