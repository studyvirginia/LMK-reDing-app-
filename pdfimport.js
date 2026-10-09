/* PDF -> Markdown. Runs in the browser with pdf.js (loaded only when a PDF is added).
   Goal: clean reading text. Page headers/footers/numbers removed, broken lines and hyphenated
   words rejoined, headings taken from the PDF's own bookmarks (or, failing that, from font size). */
(function (root) {
'use strict';

const LIG = { '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl', '\ufb03': 'ffi', '\ufb04': 'ffl', '\u00ad': '' };
const fixText = s => s.replace(/[\ufb00-\ufb04\u00ad]/g, c => LIG[c]).replace(/[\u2000-\u200a\u00a0\u202f]/g, ' ');
const key = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}
async function loadLib() {
  if (!root.pdfjsLib) await loadScript('vendor/pdfjs/pdf.min.js');
  root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  return root.pdfjsLib;
}

/* ---- one page: text items (in the order the PDF draws them) -> lines ---- */
function pageLines(items, pageNo, pageH) {
  const lines = []; let cur = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const s = fixText(it.str);
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10, w = it.width || 0;
    if (s === '' && !it.hasEOL) continue;
    if (!cur || Math.abs(y - cur.y) > Math.max(2, 0.45 * cur.h)) {
      cur = { page: pageNo, pageH, y, x0: x, x1: x, h, parts: [], sizes: {} };
      lines.push(cur);
    }
    if (cur.parts.length && s !== '') {
      const gap = x - cur.x1, last = cur.parts[cur.parts.length - 1];
      if (gap > 0.12 * h && !/\s$/.test(last) && !/^\s/.test(s)) cur.parts.push(' ');
    }
    cur.parts.push(s); cur.x1 = Math.max(cur.x1, x + w); cur.h = Math.max(cur.h, h);
    const sz = Math.round(h * 2) / 2; cur.sizes[sz] = (cur.sizes[sz] || 0) + s.trim().length;
    if (it.hasEOL) cur = null;
  }
  const out = [];
  for (const l of lines) {
    const text = l.parts.join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let size = 0, best = -1; for (const k in l.sizes) if (l.sizes[k] > best) { best = l.sizes[k]; size = +k; }
    out.push({ page: l.page, pageH: l.pageH, y: l.y, x0: l.x0, x1: l.x1, size: size || l.h, text });
  }
  return out;
}

/* ---- PDF bookmarks -> [{title, level, pageIndex}] ---- */
async function readOutline(pdf) {
  let outline = null;
  try { outline = await pdf.getOutline(); } catch (e) { return []; }
  if (!outline) return [];
  const flat = [];
  async function pageOf(dest) {
    try {
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest) || !dest.length) return -1;
      return typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : (dest[0] | 0);
    } catch (e) { return -1; }
  }
  async function walk(nodes, level) {
    for (const n of nodes) {
      const title = fixText(n.title || '').replace(/\s+/g, ' ').trim();
      const p = await pageOf(n.dest);
      if (title && p >= 0) flat.push({ title, level: Math.min(level, 4), page: p });
      if (n.items && n.items.length) await walk(n.items, level + 1);
    }
  }
  await walk(outline, 1);
  return flat;
}

/* ---- markdown escaping: pdf text must never be read as markup or math ---- */
const esc = s => s.replace(/([\\`*_$<>\[\]])/g, '\\$1').replace(/^([#+\-])/, '\\$1');

const BULLET = /^[\u2022\u25aa\u25e6\u2023\u25cf\u00b7\u2013\u2014-]\s+/;
const SENT_END = /[.!?:;]["'\u201d\u2019)\]]*$/;

/* ---- all lines of the document -> markdown ---- */
function assemble(lines, outline, numPages) {
  // 1. drop running headers / footers / page numbers
  const edge = l => l.y > l.pageH * 0.92 || l.y < l.pageH * 0.08;
  const counts = new Map();
  for (const l of lines) if (edge(l)) { const k = l.text.toLowerCase().replace(/\d+/g, '#').trim(); (counts.get(k) || counts.set(k, new Set()).get(k)).add(l.page); }
  const minRep = Math.max(3, Math.round(numPages * 0.25));
  lines = lines.filter(l => {
    if (!edge(l)) return true;
    if (/^[\divxlcdm]{1,6}$/i.test(l.text) || /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(l.text)) return false;
    const k = l.text.toLowerCase().replace(/\d+/g, '#').trim();
    return !(numPages >= 4 && counts.get(k) && counts.get(k).size >= minRep);
  });
  if (!lines.length) return { markdown: '', headings: 0 };

  // 2. body font size = the size most characters are set in
  const hist = {}; for (const l of lines) hist[l.size] = (hist[l.size] || 0) + l.text.length;
  let body = 10, best = -1; for (const k in hist) if (hist[k] > best) { best = hist[k]; body = +k; }

  // 3. which lines are headings
  const head = new Map(); // line -> level
  if (outline.length) {
    const byPage = new Map(); for (const o of outline) (byPage.get(o.page) || byPage.set(o.page, []).get(o.page)).push(o);
    const synth = new Map(); // page -> headings to insert before its first line
    for (const [pg, list] of byPage) {
      const pls = lines.filter(l => l.page === pg + 1);
      let from = 0;
      for (const o of list) {
        const tk = key(o.title); let hit = -1;
        for (let i = from; i < pls.length && hit < 0; i++) { const lk = key(pls[i].text); if (lk && (lk === tk || (tk.startsWith(lk) && lk.length > 3) || lk.startsWith(tk))) hit = i; }
        if (hit >= 0) {
          head.set(pls[hit], { level: o.level, title: o.title });
          // title that wrapped over several lines: swallow the continuation lines
          let acc = key(pls[hit].text), j = hit + 1;
          while (acc.length < tk.length && j < pls.length && tk.startsWith(acc)) { acc += key(pls[j].text); head.set(pls[j], { level: o.level, skip: true }); j++; }
          from = hit + 1;
        } else (synth.get(pg) || synth.set(pg, []).get(pg)).push(o);
      }
    }
    lines = lines.slice();
    for (const [pg, list] of synth) {
      const idx = lines.findIndex(l => l.page === pg + 1);
      const at = idx < 0 ? lines.length : idx;
      const ins = list.map(o => { const fake = { page: pg + 1, y: 1e9, x0: 0, x1: 0, size: body, text: o.title, fake: true }; head.set(fake, { level: o.level, title: o.title }); return fake; });
      lines.splice(at, 0, ...ins);
    }
  } else {
    const sizes = [...new Set(lines.filter(l => l.size >= body * 1.18 && l.text.length <= 140 && !/[,;]$/.test(l.text)).map(l => l.size))].sort((a, b) => b - a);
    const cand = lines.filter(l => sizes.includes(l.size) && l.text.length <= 140 && !/[,;]$/.test(l.text));
    if (cand.length <= Math.max(10, numPages * 3)) cand.forEach(l => head.set(l, { level: Math.min(4, sizes.indexOf(l.size) + 1) }));
  }

  // 4. left margin and typical line width, per page, for paragraph detection
  const margin = {}, right = {};
  const by = {}; for (const l of lines) if (!l.fake) (by[l.page] = by[l.page] || []).push(l);
  for (const p in by) {
    const xs = by[p].map(l => l.x0).sort((a, b) => a - b), ys = by[p].map(l => l.x1).sort((a, b) => a - b);
    margin[p] = xs[Math.floor(xs.length * 0.2)]; right[p] = ys[Math.floor(ys.length * 0.8)];
  }

  // 5. lines -> blocks
  const blocks = []; // {t:'h'|'p'|'li', level, text}
  let para = null, prev = null;
  const flush = () => { if (para) { blocks.push(para); para = null; } };
  for (const l of lines) {
    const h = head.get(l);
    if (h) {
      if (h.skip) { prev = l; continue; }
      flush();
      const last = blocks[blocks.length - 1];
      const t = h.title || l.text;
      if (last && last.t === 'h' && !h.title && last.level === h.level && prev && prev.page === l.page && prev.y - l.y < 2.2 * l.size) last.text += ' ' + t;
      else blocks.push({ t: 'h', level: h.level, text: t });
      prev = l; continue;
    }
    const text = l.text;
    const bullet = BULLET.test(text) ? text.replace(BULLET, '') : null;
    const numbered = /^\(?\d{1,2}[.)]\s+\S/.test(text);
    let newPara = !para || bullet !== null || numbered;
    if (!newPara && prev) {
      if (prev.page === l.page) {
        const gap = prev.y - l.y;
        if (gap > 1.55 * prev.size) newPara = true;
        else if (l.x0 - margin[l.page] > 0.9 * l.size && SENT_END.test(prev.text)) newPara = true;
        else if (SENT_END.test(prev.text) && prev.x1 < right[l.page] * 0.78 && /^[A-Z0-9"\u201c(]/.test(text)) newPara = true;
      } else if (SENT_END.test(prev.text) && prev.x1 < right[prev.page] * 0.85 && /^[A-Z0-9"\u201c(]/.test(text)) newPara = true;
    }
    if (newPara) { flush(); para = { t: bullet !== null ? 'li' : 'p', text: bullet !== null ? bullet : text }; }
    else if (/[A-Za-z]-$/.test(para.text) && /^[a-z]/.test(text)) para.text = para.text.slice(0, -1) + text; // hyphenated at line end
    else para.text += ' ' + text;
    prev = l;
  }
  flush();

  // 6. markdown
  const md = [];
  for (const b of blocks) {
    const t = b.text.replace(/\s+/g, ' ').trim(); if (!t) continue;
    if (b.t === 'h') md.push('#'.repeat(Math.min(6, b.level)) + ' ' + esc(t).replace(/^\\([#+\-])/, '$1'));
    else if (b.t === 'li') md.push('- ' + esc(t));
    else md.push(esc(t));
  }
  return { markdown: md.join('\n\n') + '\n', headings: blocks.filter(b => b.t === 'h').length };
}

async function extract(file, onProgress) {
  const lib = await loadLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await lib.getDocument({ data, isEvalSupported: false }).promise;
  const n = pdf.numPages, lines = [];
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    lines.push(...pageLines(tc.items, p, vp.height));
    page.cleanup();
    if (onProgress && (p % 5 === 0 || p === n)) onProgress(p, n);
    if (p % 20 === 0) await new Promise(r => setTimeout(r, 0)); // keep the page responsive
  }
  const outline = await readOutline(pdf);
  try { pdf.destroy(); } catch (e) {}
  const chars = lines.reduce((a, l) => a + l.text.length, 0);
  if (chars < 20 * n) { const e = new Error('no selectable text'); e.code = 'scanned'; throw e; }
  const r = assemble(lines, outline, n);
  return { markdown: r.markdown, pages: n, outline: outline.length, headings: r.headings };
}

const api = { extract, assemble, pageLines };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PdfImport = api;
})(typeof self !== 'undefined' ? self : this);
