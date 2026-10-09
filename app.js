/* Book Reader UI: library, chunked rendering, playback.
   A book is split into sections ("chunks"). Only the sections near the screen exist in the page,
   so a 900-page book costs about the same as a 30-page one. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const Core = window.BookCore;

/* ---------- settings (localStorage, per-device conveniences) ---------- */
const DEFAULTS = { engine: 'kokoro', kvoice: 'af_heart', dvoice: '', speed: 1, fs: 19, wrap: false, cur: '' };
let settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem('br.settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('br.settings', JSON.stringify(settings)); } catch (e) {} };

/* ---------- storage (IndexedDB; falls back to memory) ----------
   Book metadata (name, place, progress) is tiny and saved often. The book text lives in its own
   record ('t:<id>') and is written once, so reading a 3 MB book never rewrites 3 MB every few seconds. */
const mem = new Map();
let dbp = null;
try {
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('bookreader', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
} catch (e) { dbp = Promise.reject(e); }
function tx(mode, fn) {
  return dbp.then(d => new Promise((res, rej) => {
    const t = d.transaction('books', mode); const rq = fn(t.objectStore('books'));
    t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const store = {
  all: () => tx('readonly', s => s.getAll()).catch(() => [...mem.values()]),
  put: b => tx('readwrite', s => s.put(b)).catch(() => { mem.set(b.id, b); }),
  get: id => tx('readonly', s => s.get(id)).catch(() => mem.get(id)),
  del: id => tx('readwrite', s => { s.delete(id); return s.delete('t:' + id); }).catch(() => { mem.delete(id); mem.delete('t:' + id); }),
  putText: (id, text) => store.put({ id: 't:' + id, text }),
  getText: async id => { const r = await store.get('t:' + id); return r ? r.text : null; }
};
const metaOf = b => { const m = Object.assign({}, b); delete m.text; return m; };

/* ---------- status toast ---------- */
let statusTimer = 0;
function status(msg, ms) {
  const el = $('status'); clearTimeout(statusTimer);
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg; el.style.display = 'block';
  if (ms) statusTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}
$('status').onclick = () => status(null);

/* ---------- state ---------- */
let books = [];
let book = null;
let chunks = [];      // {text, chars, before, units, html, maths, els, attached, mobs}
let secs = [];        // <section> element per chunk
let totalChars = 1;
let cc = 0, ci = 0;   // playhead: chunk index, sentence index within chunk
let playing = false;
let playToken = 0;
let saveTimer = 0;
let pxPerChar = 0.5;  // learned: how tall a chunk is per character, to size sections that aren't built yet
let chunkObs = null;
let openStamp = 0;
let toc = [];         // table of contents: {level, title, c, n}

/* ---------- building and showing chunks ---------- */
function renderMath(tex, display) {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, trust: false, output: 'html' }); }
  catch (e) { return Core.esc(tex); }
}
marked.setOptions({ gfm: true, breaks: false });
const env = () => ({ lazyMath: true, renderMath, parseInline: s => marked.parseInline(s), parseBlock: s => marked.parse(s) });
const looksTex = (b, text) => b.type === 'tex' || /\\documentclass|\\begin\{document\}/.test(text.slice(0, 20000));

function ensureData(c) { // turn the raw text of a chunk into sentences + html (no DOM work)
  const ch = chunks[c];
  if (!ch.units) { const d = Core.buildDocument(ch.text, env()); ch.units = d.units; ch.html = d.html; ch.maths = d.maths; ch.headings = d.headings; }
  return ch;
}
function buildToc() {
  toc = [];
  chunks.forEach((ch, c) => { Core.scanHeadings(ch.text).forEach(h => toc.push({ level: h.level, title: h.title, c, n: h.n })); });
  if (toc.length < 2) { // no real headings: offer the parts of the book instead
    toc = chunks.map((ch, c) => {
      const first = (ch.text.split('\n').find(l => /[A-Za-z0-9]/.test(l)) || '').replace(/^#+\s*/, '');
      return { level: 1, title: 'Part ' + (c + 1) + ' — ' + Core.plainTitle(first).slice(0, 60), c, n: 0, part: true };
    });
  }
}
// sentence index of a TOC entry (its heading), or the first sentence of its chunk
function tocUnit(e) {
  ensureData(e.c);
  const hs = chunks[e.c].headings.filter(h => h.title === e.title && h.unit >= 0);
  const h = hs[e.n] || hs[0];
  return h ? h.unit : firstPos(e.c)[1];
}
function drawMath(ch, el) {
  if (el.dataset.done) return; el.dataset.done = '1';
  const m = ch.maths[+el.dataset.m]; if (m) el.innerHTML = renderMath(m.tex, m.display);
}
function attach(c) {
  const ch = chunks[c]; if (!ch || ch.attached) return;
  ensureData(c);
  const sec = secs[c];
  sec.innerHTML = ch.html; sec.style.minHeight = ''; ch.attached = true; ch.els = [];
  sec.querySelectorAll('[data-i]').forEach(e => { (ch.els[+e.dataset.i] = ch.els[+e.dataset.i] || []).push(e); });
  const mjs = sec.querySelectorAll('.mj');
  if ('IntersectionObserver' in window) {
    ch.mobs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { drawMath(ch, e.target); ch.mobs.unobserve(e.target); } }), { root: $('main'), rootMargin: '2500px 0px' });
    mjs.forEach(el => ch.mobs.observe(el));
  } else mjs.forEach(el => drawMath(ch, el));
  const h = sec.offsetHeight; if (h && ch.chars > 2000) pxPerChar = pxPerChar * 0.7 + 0.3 * (h / ch.chars);
  if (c === cc) (ch.els[ci] || []).forEach(e => e.classList.add('active'));
}
function detach(c) {
  const ch = chunks[c]; if (!ch || !ch.attached) return;
  const sec = secs[c]; sec.style.minHeight = sec.offsetHeight + 'px'; sec.innerHTML = '';
  if (ch.mobs) { ch.mobs.disconnect(); ch.mobs = null; }
  ch.els = []; ch.attached = false;
}
function drawMathAround(c, i) { // draw equations near the playhead right away so scrolling lands in the right spot
  const ch = chunks[c]; if (!ch || !ch.attached) return;
  for (let k = Math.max(0, i - 80); k < Math.min(ch.els.length, i + 80); k++) (ch.els[k] || []).forEach(e => e.querySelectorAll('.mj').forEach(m => drawMath(ch, m)));
}

/* walk sentences across chunk boundaries; returns [chunk, index] or null at either end of the book */
function stepPos(c, i, d) {
  i += d;
  for (;;) {
    if (c < 0 || c >= chunks.length) return null;
    const n = ensureData(c).units.length;
    if (i >= 0 && i < n) return [c, i];
    if (d > 0) { c++; i = 0; } else { c--; if (c < 0) return null; i = ensureData(c).units.length - 1; }
  }
}
const firstPos = c => { const p = stepPos(Math.max(0, c), -1, 1); return p || stepPos(chunks.length - 1, 0, -1) || [0, 0]; };

function progress() {
  const ch = chunks[cc]; if (!ch) return 0;
  const n = (ch.units && ch.units.length) || 1;
  const pct = Math.min(100, Math.max(0, Math.round(100 * (ch.before + ch.chars * (ci / n)) / totalChars)));
  $('prog').textContent = 'Part ' + (cc + 1) + '/' + chunks.length + ' · ' + pct + '%';
  $('barfill').style.width = pct + '%';
  return pct;
}
function mark(scroll) {
  document.querySelectorAll('.s.active').forEach(e => e.classList.remove('active'));
  if (!chunks[cc]) return;
  attach(cc);
  const els = chunks[cc].els[ci] || [];
  els.forEach(e => e.classList.add('active'));
  drawMathAround(cc, ci);
  if (scroll !== false && els[0]) {
    const m = $('main');
    if (scroll === 'jump') m.style.scrollBehavior = 'auto'; // no slow glide when restoring a place
    els[0].scrollIntoView({ block: 'center' });
    if (scroll === 'jump') m.style.scrollBehavior = '';
  }
  progress();
}

function jumpTo(c, i) {
  if (playing) { start(c, i); } else { cc = c; ci = i; mark('jump'); savePos(); }
  const stamp = ++openStamp;
  // neighbouring sections finish building a moment later and can nudge the page; re-centre once they have settled
  [150, 600].forEach(ms => setTimeout(() => { if (stamp === openStamp && cc === c && ci === i && !playing) mark('jump'); }, ms));
}

async function openBook(b) {
  stop();
  status('Opening…');
  let text = await store.getText(b.id);
  if (text == null) { status('Could not find this book’s text on this device. Delete it and add it again.'); return; }
  book = b; settings.cur = b.id; saveSettings(); $('title').textContent = b.name;
  await new Promise(r => setTimeout(r, 10)); // let "Opening…" paint
  const src = (looksTex(b, text) ? Core.texToMd(text) : text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  const parts = Core.splitChunks(src);
  text = null;
  if (chunkObs) chunkObs.disconnect();
  chunks = parts.map(t => ({ text: t, chars: t.length, units: null, html: '', maths: [], els: [], attached: false, mobs: null }));
  let acc = 0; chunks.forEach(ch => { ch.before = acc; acc += ch.chars; }); totalChars = acc || 1;
  const content = $('content'); content.textContent = '';
  secs = chunks.map((ch, c) => {
    const s = document.createElement('section'); s.className = 'chunk'; s.dataset.c = c; s.style.minHeight = Math.round(ch.chars * pxPerChar) + 'px';
    content.appendChild(s); return s;
  });
  const p0 = b.pos && typeof b.pos === 'object' ? b.pos : { c: 0, u: 0 };
  cc = Math.max(0, Math.min(chunks.length - 1, p0.c | 0)); ci = Math.max(0, p0.u | 0);
  const n = ensureData(cc).units.length;
  if (ci >= n) { const p = firstPos(cc); cc = p[0]; ci = p[1]; }
  if (!stepPos(0, -1, 1)) { content.innerHTML = '<div class="empty">This file has no readable text.</div>'; chunks = []; secs = []; toc = []; status(null); return; }
  cacheClear();
  mark('jump');
  status(null);
  if ('IntersectionObserver' in window) {
    chunkObs = new IntersectionObserver(es => es.forEach(e => {
      const c = +e.target.dataset.c;
      if (e.isIntersecting) attach(c); else if (Math.abs(c - cc) > 1) detach(c);
    }), { root: $('main'), rootMargin: '3000px 0px' });
    secs.forEach(s => chunkObs.observe(s));
  }
  const stamp = ++openStamp, c0 = cc, i0 = ci;
  [150, 600].forEach(ms => setTimeout(() => { if (stamp === openStamp && cc === c0 && ci === i0 && !playing) mark('jump'); }, ms));
  buildToc();
  savePos();
}

function savePos() {
  if (!book) return;
  book.pos = { c: cc, u: ci }; book.pct = progress(); book.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.put(metaOf(book)), 500);
}
window.addEventListener('pagehide', () => { if (book) { book.pos = { c: cc, u: ci }; store.put(metaOf(book)); } });

/* ---------- natural voice (Kokoro, runs in the browser) ---------- */
const KVOICES = [['af_heart', 'Heart (US female)'], ['af_bella', 'Bella (US female)'], ['af_nicole', 'Nicole (US female)'], ['af_sarah', 'Sarah (US female)'],
  ['am_michael', 'Michael (US male)'], ['am_fenrir', 'Fenrir (US male)'], ['am_adam', 'Adam (US male)'],
  ['bf_emma', 'Emma (UK female)'], ['bf_isabella', 'Isabella (UK female)'], ['bm_george', 'George (UK male)'], ['bm_lewis', 'Lewis (UK male)']];
let kokoro = null, kokoroP = null, synthChain = Promise.resolve();
const audioCache = new Map();
let keep = new Set();
const akey = (c, i) => book.id + '|' + settings.kvoice + '|' + c + '|' + i;
function cacheClear() { audioCache.forEach(p => p.then(u => u.forEach(URL.revokeObjectURL)).catch(() => {})); audioCache.clear(); keep = new Set(); }

async function loadKokoro() {
  if (kokoro) return kokoro;
  if (!kokoroP) kokoroP = (async () => {
    status('Loading natural voice (first time ≈ 90 MB)…');
    const mod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    const t = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8', device: 'wasm',
      progress_callback: p => { if (p && p.status === 'progress') status('Downloading voice… ' + Math.round(p.progress || 0) + '%'); }
    });
    status(null); return t;
  })();
  try { kokoro = await kokoroP; } catch (e) { kokoroP = null; throw e; }
  return kokoro;
}
function wavBlob(f32, rate) {
  const n = f32.length, b = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let k = 0; k < s.length; k++) b.setUint8(o + k, s.charCodeAt(k)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
  for (let k = 0; k < n; k++) b.setInt16(44 + k * 2, Math.max(-1, Math.min(1, f32[k])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}
function synth(c, i) {
  const key = akey(c, i);
  if (audioCache.has(key)) return audioCache.get(key);
  const text = chunks[c].units[i].speak, voice = settings.kvoice;
  const p = synthChain.catch(() => {}).then(async () => {
    const urls = [];
    for (const chunk of Core.chunkForTTS(text)) {
      const a = await kokoro.generate(chunk, { voice, speed: 1 });
      urls.push(URL.createObjectURL(a.toBlob ? a.toBlob() : wavBlob(a.audio, a.sampling_rate)));
    }
    return urls;
  });
  synthChain = p;
  audioCache.set(key, p);
  p.catch(() => audioCache.delete(key));
  // drop audio that is no longer near the playhead (decided by the playhead window, not by what is being prepared)
  audioCache.forEach((v, k) => { if (!keep.has(k)) { v.then(u => u.forEach(URL.revokeObjectURL)).catch(() => {}); audioCache.delete(k); } });
  return p;
}
// One reusable <audio> element. Phones only allow audio from an element that was started inside a tap,
// and generating speech takes long enough that the tap has expired, so we "unlock" it on the tap itself.
const player = new Audio();
player.preload = 'auto';
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlockAudio() {
  try { player.src = SILENCE; const p = player.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
async function playUrls(urls, token) {
  for (const url of urls) {
    if (token !== playToken) return;
    await new Promise((res, rej) => {
      player.onended = () => res();
      player.onerror = () => rej(new Error('the browser could not play the generated audio' + (player.error ? ' (code ' + player.error.code + (player.error.message ? ': ' + player.error.message : '') + ')' : '')));
      player.src = url;
      player.defaultPlaybackRate = settings.speed; player.playbackRate = settings.speed; player.preservesPitch = true;
      player.play().catch(rej);
    });
  }
}

/* ---------- device voice (Web Speech API) ---------- */
function speakDevice(text, token) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) { status('This browser has no built-in voice.', 4000); return res(); }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(settings.speed, 3);
    const v = speechSynthesis.getVoices().find(x => x.voiceURI === settings.dvoice);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.onend = u.onerror = () => res();
    if (token === playToken) speechSynthesis.speak(u); else res();
  });
}

/* ---------- playback loop ---------- */
let forceDevice = false; // set when the natural voice fails; lasts until the page reloads, never saved
const errText = e => (e && (e.name ? e.name + ': ' : '') + (e.message || e)) || String(e);
function windowAround() { // sentences to keep audio for: 2 behind, 3 ahead
  const fwd = [], back = [];
  let p = [cc, ci];
  for (let k = 0; k < 3; k++) { p = stepPos(p[0], p[1], 1); if (!p) break; fwd.push(p); }
  p = [cc, ci];
  for (let k = 0; k < 2; k++) { p = stepPos(p[0], p[1], -1); if (!p) break; back.push(p); }
  return { fwd, back };
}
async function run(token) {
  while (token === playToken) {
    mark();
    const c = cc, i = ci;
    try {
      if (settings.engine === 'kokoro' && !forceDevice) {
        try { await loadKokoro(); }
        catch (e) {
          console.error(e);
          status('Natural voice could not load (' + errText(e) + '). Using the device voice for now. Tap here to dismiss.');
          forceDevice = true;
          continue;
        }
        const w = windowAround();
        keep = new Set([akey(c, i)].concat(w.fwd.map(p => akey(p[0], p[1])), w.back.map(p => akey(p[0], p[1]))));
        const mine = synth(c, i);
        w.fwd.forEach(p => synth(p[0], p[1]));
        status('Preparing voice…');
        let urls;
        try { urls = await mine; }
        catch (e) {
          console.error(e);
          status('Natural voice failed while speaking (' + errText(e) + '). Using the device voice for now. Tap here to dismiss.');
          forceDevice = true;
          continue;
        }
        status(null);
        if (token !== playToken) return;
        try { await playUrls(urls, token); }
        catch (e) {
          if (token !== playToken) return;
          console.error(e);
          if (e && e.name === 'NotAllowedError') { status('Your browser blocked the audio. Tap ▶ again.'); playing = false; syncPlay(); return; }
          status('Audio playback failed (' + errText(e) + '). Using the device voice for now. Tap here to dismiss.');
          forceDevice = true;
          continue;
        }
      } else {
        await speakDevice(chunks[c].units[i].speak, token);
      }
    } catch (e) { console.error(e); status('Playback error: ' + errText(e) + '. Tap here to dismiss.'); break; }
    if (token !== playToken) return;
    const n = stepPos(cc, ci, 1);
    if (!n) break;
    cc = n[0]; ci = n[1]; savePos();
  }
  if (token === playToken) { playing = false; savePos(); syncPlay(); }
}
function start(c, i) {
  if (!chunks.length) return;
  unlockAudio(); // must happen synchronously inside the tap
  stop(true);
  forceDevice = false; // retry the natural voice on every fresh play
  if (c != null) { cc = c; ci = i; }
  playing = true; syncPlay(); savePos();
  run(++playToken);
}
function stop(keepFlag) {
  playToken++;
  player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (!keepFlag) { playing = false; syncPlay(); }
}
function toggle() { playing ? stop() : start(); }
function skip(d) {
  if (!chunks.length) return;
  const n = d === 0 ? [cc, ci] : stepPos(cc, ci, d);
  if (!n) return;
  if (playing) start(n[0], n[1]); else { cc = n[0]; ci = n[1]; mark(); savePos(); }
}
function syncPlay() {
  $('btnPlay').innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => start());
  ms.setActionHandler('pause', () => stop());
  ms.setActionHandler('nexttrack', () => skip(1));
  ms.setActionHandler('previoustrack', () => skip(-1));
}

/* ---------- library ---------- */
async function refreshBooks() {
  const all = await store.all();
  books = all.filter(r => !String(r.id).startsWith('t:'));
  for (const b of books) { // move text out of old-style records so it is not rewritten on every save
    if (typeof b.text === 'string') { await store.putText(b.id, b.text); delete b.text; await store.put(metaOf(b)); }
  }
  books.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  renderLibrary();
}
function renderLibrary() {
  const box = $('books'); box.textContent = '';
  if (!books.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'No books yet. Add a file or paste text below.'; box.appendChild(d); return; }
  for (const b of books) {
    const pct = b.pct || 0;
    const row = document.createElement('div'); row.className = 'book' + (book && book.id === b.id ? ' cur' : '');
    const nm = document.createElement('div'); nm.className = 'nm';
    const t = document.createElement('b'); t.textContent = b.name;
    const sm = document.createElement('small'); sm.textContent = b.pct != null ? pct + '% read' : 'not opened yet';
    const meter = document.createElement('div'); meter.className = 'meter'; const fill = document.createElement('i'); fill.style.width = pct + '%'; meter.appendChild(fill);
    nm.append(t, sm, meter);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = 'Delete';
    x.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Delete "' + b.name + '" from this device?')) return;
      await store.del(b.id);
      if (book && book.id === b.id) { stop(); book = null; chunks = []; secs = []; toc = []; $('content').innerHTML = welcome(); $('title').textContent = 'Book Reader'; $('prog').textContent = ''; $('barfill').style.width = '0'; }
      refreshBooks();
    };
    row.append(nm, x);
    row.onclick = () => { $('dlgLib').close(); openBook(b); };
    box.appendChild(row);
  }
}
async function addBook(name, text, type) {
  const b = { id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6), name, type, pos: { c: 0, u: 0 }, pct: 0, updated: Date.now() };
  await store.putText(b.id, text); await store.put(b); return b;
}
const notText = (name, text) => /\.(epub|docx?|pptx?|rtf|png|jpe?g|gif|zip)$/i.test(name) || text.slice(0, 4000).indexOf('\u0000') >= 0 || text.slice(0, 4000).indexOf('\uFFFD') >= 0;
$('btnFiles').onclick = () => $('files').click();
$('files').onchange = async e => {
  let last = null;
  for (const f of e.target.files) {
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        status('Reading PDF ' + f.name + '…');
        const r = await PdfImport.extract(f, (p, n) => status('Reading PDF ' + f.name + ': page ' + p + ' of ' + n + '…'));
        status('Saving ' + f.name + '…');
        last = await addBook(f.name.replace(/\.[^.]+$/, ''), r.markdown, 'md');
        continue;
      }
      status('Reading ' + f.name + '…');
      const text = await f.text();
      if (notText(f.name, text)) { status(null); alert('"' + f.name + '" is not a text file (Word and e-book files can’t be read directly).\n\nExport or convert it to Markdown (.md), LaTeX (.tex), plain text (.txt) or PDF and add that instead.'); continue; }
      status('Saving ' + f.name + '…');
      last = await addBook(f.name.replace(/\.[^.]+$/, ''), text, /\.tex$/i.test(f.name) ? 'tex' : 'md');
    } catch (err) {
      console.error(err); status(null);
      if (err && err.code === 'scanned') alert('"' + f.name + '" has no selectable text. It looks like scanned page images, which need OCR (text recognition) first.');
      else alert('Could not read "' + f.name + '": ' + (err && err.message || err));
    }
  }
  status(null); e.target.value = '';
  await refreshBooks();
  if (last) { $('dlgLib').close(); openBook(last); }
};
$('btnPaste').onclick = async () => {
  const text = $('pasteText').value; if (!text.trim()) return;
  const b = await addBook($('pasteName').value.trim() || 'Pasted text', text, 'md');
  $('pasteText').value = ''; $('pasteName').value = '';
  await refreshBooks(); $('dlgLib').close(); openBook(b);
};
$('btnLib').onclick = () => { renderLibrary(); $('dlgLib').showModal(); };
$('closeLib').onclick = () => $('dlgLib').close();
$('btnSet').onclick = () => $('dlgSet').showModal();
$('closeSet').onclick = () => $('dlgSet').close();


/* ---------- table of contents dialog ---------- */
function currentTocIndex() {
  let cur = -1;
  for (let k = 0; k < toc.length; k++) {
    const e = toc[k];
    if (e.c < cc) cur = k;
    else if (e.c === cc) { if (tocUnit(e) <= ci) cur = k; }
    else break;
  }
  return cur;
}
function renderToc() {
  const list = $('tocList'), q = $('tocFilter').value.trim().toLowerCase();
  list.textContent = '';
  if (!toc.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = book ? 'No headings found in this book.' : 'Open a book first.'; list.appendChild(d); return; }
  const minLevel = Math.min.apply(null, toc.map(e => e.level));
  const cur = currentTocIndex();
  let shown = 0, curBtn = null;
  for (let k = 0; k < toc.length; k++) {
    const e = toc[k];
    if (q && e.title.toLowerCase().indexOf(q) < 0) continue;
    if (!q && shown >= 800 && k !== cur) continue; // very long contents: show the first 800, search for the rest
    const b = document.createElement('button'); b.className = 'toc' + (k === cur ? ' cur' : '');
    b.style.paddingLeft = (6 + (e.level - minLevel) * 16) + 'px';
    b.textContent = e.title;
    b.onclick = () => { $('dlgToc').close(); jumpTo(e.c, tocUnit(e)); };
    list.appendChild(b); shown++; if (k === cur) curBtn = b;
  }
  if (!q && toc.length > 800) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'Showing the first 800 of ' + toc.length + ' headings. Type above to search all of them.'; list.appendChild(d); }
  if (curBtn) curBtn.scrollIntoView({ block: 'center' });
}
$('btnToc').onclick = () => { $('tocFilter').value = ''; renderToc(); $('dlgToc').showModal(); };
$('closeToc').onclick = () => $('dlgToc').close();
$('tocFilter').oninput = renderToc;

/* ---------- settings UI ---------- */
function syncSettingsUI() {
  $('engine').value = settings.engine;
  $('rowKVoice').style.display = settings.engine === 'kokoro' ? '' : 'none';
  $('rowDVoice').style.display = settings.engine === 'device' ? '' : 'none';
  $('kvoice').value = settings.kvoice; $('fs').value = settings.fs; $('wrap').checked = settings.wrap; $('speed').value = String(settings.speed);
  document.documentElement.style.setProperty('--fs', settings.fs + 'px');
  document.body.classList.toggle('wrap', settings.wrap);
}
function fillSelects() {
  $('kvoice').innerHTML = KVOICES.map(v => '<option value="' + v[0] + '">' + v[1] + '</option>').join('');
  $('speed').innerHTML = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map(s => '<option value="' + s + '">' + s + '×</option>').join('');
  const fillDev = () => {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    $('dvoice').innerHTML = vs.map(v => '<option value="' + Core.esc(v.voiceURI) + '">' + Core.esc(v.name + ' (' + v.lang + ')') + '</option>').join('');
    if (settings.dvoice) $('dvoice').value = settings.dvoice;
  };
  fillDev(); if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = fillDev;
}
const restartIfPlaying = () => { if (playing) start(cc, ci); };
$('engine').onchange = e => { settings.engine = e.target.value; saveSettings(); syncSettingsUI(); restartIfPlaying(); };
$('kvoice').onchange = e => { settings.kvoice = e.target.value; saveSettings(); cacheClear(); restartIfPlaying(); };
$('dvoice').onchange = e => { settings.dvoice = e.target.value; saveSettings(); restartIfPlaying(); };
$('speed').onchange = e => { settings.speed = +e.target.value; saveSettings(); player.playbackRate = settings.speed; if (playing && (settings.engine === 'device' || forceDevice)) restartIfPlaying(); };
$('fs').oninput = e => { settings.fs = +e.target.value; saveSettings(); syncSettingsUI(); };
$('wrap').onchange = e => { settings.wrap = e.target.checked; saveSettings(); syncSettingsUI(); };

/* ---------- controls ---------- */
$('btnPlay').onclick = toggle;
$('btnPrev').onclick = () => skip(-1);
$('btnNext').onclick = () => skip(1);
$('content').addEventListener('click', e => {
  if (window.getSelection && String(window.getSelection())) return; // don't hijack text selection
  const s = e.target.closest('.s'); if (!s) return;
  const sec = s.closest('.chunk'); if (sec) start(+sec.dataset.c, +s.dataset.i);
});
document.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') skip(1);
  else if (e.code === 'ArrowLeft') skip(-1);
});

/* ---------- boot ---------- */
const welcome = () => '<div class="empty"><h2>Book Reader</h2>Open <b>Library</b> to add a Markdown or LaTeX file.<br>Press play to hear it read aloud; tap any sentence to jump there.<br>Your place is saved automatically.</div>';
(async function boot() {
  fillSelects(); syncSettingsUI(); syncPlay();
  $('content').innerHTML = welcome();
  await refreshBooks();
  const last = books.find(b => b.id === settings.cur) || books[0];
  if (last) openBook(last); else $('dlgLib').showModal();
})();

// small hooks for automated tests
window.__reader = {
  get pos() { return { c: cc, u: ci }; }, get nchunks() { return chunks.length; },
  get attached() { return chunks.filter(c => c.attached).length; },
  get cur() { return chunks[cc] && chunks[cc].units && chunks[cc].units[ci] && chunks[cc].units[ci].speak; },
  get books() { return books; }, get toc() { return toc; }, start, stop, skip, openBook
};
})();
