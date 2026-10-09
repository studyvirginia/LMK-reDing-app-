/* Book Reader UI: library, rendering, playback. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const Core = window.BookCore;

/* ---------- settings (localStorage, per-device conveniences) ---------- */
const DEFAULTS = { engine: 'kokoro', kvoice: 'af_heart', dvoice: '', speed: 1, fs: 19, wrap: false, cur: '' };
let settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem('br.settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('br.settings', JSON.stringify(settings)); } catch (e) {} };

/* ---------- storage (IndexedDB; falls back to memory) ---------- */
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
    t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error);
  }));
}
const store = {
  all: () => tx('readonly', s => s.getAll()).catch(() => [...mem.values()]),
  put: b => tx('readwrite', s => s.put(b)).catch(() => { mem.set(b.id, b); }),
  del: id => tx('readwrite', s => s.delete(id)).catch(() => { mem.delete(id); })
};

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
let units = [];
let els = [];
let idx = 0;
let playing = false;
let playToken = 0;
let saveTimer = 0;

/* ---------- rendering ---------- */
function renderMath(tex, display) {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, trust: false, output: 'html' }); }
  catch (e) { return Core.esc(tex); }
}
marked.setOptions({ gfm: true, breaks: false });
const env = () => ({
  renderMath,
  parseInline: s => marked.parseInline(s),
  parseBlock: s => marked.parse(s)
});
const isTex = b => b.type === 'tex' || /\\documentclass|\\begin\{document\}/.test(b.text);

function openBook(b) {
  stop();
  book = b; settings.cur = b.id; saveSettings();
  $('title').textContent = b.name;
  status('Rendering…');
  setTimeout(() => {
    const src = isTex(b) ? Core.texToMd(b.text) : b.text;
    const doc = Core.buildDocument(src, env());
    units = doc.units;
    $('content').innerHTML = doc.html || '<div class="empty">This file has no readable text.</div>';
    els = [];
    $('content').querySelectorAll('[data-i]').forEach(e => { (els[+e.dataset.i] = els[+e.dataset.i] || []).push(e); });
    idx = Math.min(b.pos || 0, Math.max(0, units.length - 1));
    if (b.total !== units.length) { b.total = units.length; store.put(b); }
    cacheClear(); status(null);
    mark(idx, true);
  }, 20);
}

function mark(i, scroll) {
  document.querySelectorAll('.s.active').forEach(e => e.classList.remove('active'));
  (els[i] || []).forEach(e => e.classList.add('active'));
  if (scroll !== false && els[i] && els[i][0]) els[i][0].scrollIntoView({ block: 'center' });
  const n = units.length, pct = n ? Math.round(((i + 1) / n) * 100) : 0;
  $('prog').textContent = n ? (i + 1) + ' / ' + n + ' · ' + pct + '%' : '';
  $('barfill').style.width = pct + '%';
}

function savePos() {
  if (!book) return;
  book.pos = idx; book.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.put(book), 500);
}
window.addEventListener('pagehide', () => { if (book) { book.pos = idx; store.put(book); } });

/* ---------- natural voice (Kokoro, runs in the browser) ---------- */
const KVOICES = [['af_heart', 'Heart (US female)'], ['af_bella', 'Bella (US female)'], ['af_nicole', 'Nicole (US female)'], ['af_sarah', 'Sarah (US female)'],
  ['am_michael', 'Michael (US male)'], ['am_fenrir', 'Fenrir (US male)'], ['am_adam', 'Adam (US male)'],
  ['bf_emma', 'Emma (UK female)'], ['bf_isabella', 'Isabella (UK female)'], ['bm_george', 'George (UK male)'], ['bm_lewis', 'Lewis (UK male)']];
let kokoro = null, kokoroP = null, synthChain = Promise.resolve();
const audioCache = new Map();
const cacheKey = i => book.id + '|' + settings.kvoice + '|' + i;
function cacheClear() { audioCache.forEach(p => p.then(u => u.forEach(URL.revokeObjectURL)).catch(() => {})); audioCache.clear(); }

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
function synth(i) {
  const key = cacheKey(i);
  if (audioCache.has(key)) return audioCache.get(key);
  const text = units[i].speak, voice = settings.kvoice;
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
  // drop audio well behind the playhead (measured from what is being READ, not what is being prepared)
  audioCache.forEach((v, k) => { const n = +k.split('|')[2]; if (n < idx - 2) { v.then(u => u.forEach(URL.revokeObjectURL)).catch(() => {}); audioCache.delete(k); } });
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
async function run(token) {
  while (token === playToken && idx < units.length) {
    mark(idx);
    try {
      if (settings.engine === 'kokoro' && !forceDevice) {
        try { await loadKokoro(); }
        catch (e) {
          console.error(e);
          status('Natural voice could not load (' + errText(e) + '). Using the device voice for now. Tap here to dismiss.');
          forceDevice = true;
          continue;
        }
        const mine = synth(idx);
        for (let k = 1; k <= 3 && idx + k < units.length; k++) synth(idx + k);
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
        await speakDevice(units[idx].speak, token);
      }
    } catch (e) { console.error(e); status('Playback error: ' + errText(e) + '. Tap here to dismiss.'); break; }
    if (token !== playToken) return;
    if (idx >= units.length - 1) break;
    idx++; savePos();
  }
  if (token === playToken) { playing = false; savePos(); syncPlay(); }
}
function start(i) {
  if (!units.length) return;
  unlockAudio(); // must happen synchronously inside the tap
  stop(true);
  forceDevice = false; // retry the natural voice on every fresh play
  if (i != null) idx = Math.max(0, Math.min(units.length - 1, i));
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
  if (!units.length) return;
  const n = Math.max(0, Math.min(units.length - 1, idx + d));
  if (playing) start(n); else { idx = n; mark(idx); savePos(); }
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
async function refreshBooks() { books = (await store.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0)); renderLibrary(); }
function renderLibrary() {
  const box = $('books'); box.textContent = '';
  if (!books.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'No books yet. Add a file or paste text below.'; box.appendChild(d); return; }
  for (const b of books) {
    const pct = b.total ? Math.round((((b.pos || 0) + 1) / b.total) * 100) : 0;
    const row = document.createElement('div'); row.className = 'book' + (book && book.id === b.id ? ' cur' : '');
    const nm = document.createElement('div'); nm.className = 'nm';
    const t = document.createElement('b'); t.textContent = b.name;
    const sm = document.createElement('small'); sm.textContent = b.total ? pct + '% · sentence ' + ((b.pos || 0) + 1) + ' of ' + b.total : 'not opened yet';
    const meter = document.createElement('div'); meter.className = 'meter'; const fill = document.createElement('i'); fill.style.width = pct + '%'; meter.appendChild(fill);
    nm.append(t, sm, meter);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = 'Delete';
    x.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Delete "' + b.name + '" from this device?')) return;
      await store.del(b.id);
      if (book && book.id === b.id) { stop(); book = null; units = []; $('content').innerHTML = welcome(); $('title').textContent = 'Book Reader'; $('prog').textContent = ''; $('barfill').style.width = '0'; }
      refreshBooks();
    };
    row.append(nm, x);
    row.onclick = () => { $('dlgLib').close(); openBook(b); };
    box.appendChild(row);
  }
}
async function addBook(name, text, type) {
  const b = { id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6), name, text, type, pos: 0, total: 0, updated: Date.now() };
  await store.put(b); return b;
}
$('btnFiles').onclick = () => $('files').click();
$('files').onchange = async e => {
  let last = null;
  for (const f of e.target.files) {
    const text = await f.text();
    last = await addBook(f.name.replace(/\.[^.]+$/, ''), text, /\.tex$/i.test(f.name) ? 'tex' : 'md');
  }
  e.target.value = '';
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
const restartIfPlaying = () => { if (playing) start(idx); };
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
  const s = e.target.closest('.s'); if (s) start(+s.dataset.i);
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

window.__reader = { get units() { return units; }, get idx() { return idx; }, start, stop, skip, openBook, get books() { return books; } }; // for tests
})();
