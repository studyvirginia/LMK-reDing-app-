/* Book Reader core: pure text logic (no DOM). Works in browser and node. */
(function (root) {
'use strict';

/* ---------- math -> speech ---------- */

const GREEK = {
  alpha:'alpha',beta:'beta',gamma:'gamma',delta:'delta',epsilon:'epsilon',varepsilon:'epsilon',zeta:'zeta',eta:'eta',
  theta:'theta',vartheta:'theta',iota:'iota',kappa:'kappa',lambda:'lambda',mu:'mu',nu:'nu',xi:'xi',pi:'pi',varpi:'pi',
  rho:'rho',varrho:'rho',sigma:'sigma',varsigma:'sigma',tau:'tau',upsilon:'upsilon',phi:'phi',varphi:'phi',chi:'chi',
  psi:'psi',omega:'omega',Gamma:'capital gamma',Delta:'capital delta',Theta:'capital theta',Lambda:'capital lambda',
  Xi:'capital xi',Pi:'capital pi',Sigma:'capital sigma',Upsilon:'capital upsilon',Phi:'capital phi',Psi:'capital psi',
  Omega:'capital omega'
};
const SYM = {
  cdot:'dot',times:'times',div:'divided by',pm:'plus or minus',mp:'minus or plus',
  le:'is at most',leq:'is at most',ge:'is at least',geq:'is at least',ne:'is not equal to',neq:'is not equal to',
  approx:'is approximately',sim:'is similar to',simeq:'is similar or equal to',cong:'is congruent to',equiv:'is equivalent to',
  propto:'is proportional to',to:'goes to',rightarrow:'goes to',longrightarrow:'goes to',mapsto:'maps to',
  Rightarrow:'implies',implies:'implies',Longrightarrow:'implies',Leftrightarrow:'if and only if',iff:'if and only if',
  leftarrow:'left arrow',gets:'left arrow',leftrightarrow:'two-way arrow',
  in:'is in',notin:'is not in',ni:'contains',subset:'is a subset of',subseteq:'is a subset of or equal to',
  supset:'is a superset of',supseteq:'is a superset of or equal to',cup:'union',cap:'intersection',setminus:'minus',
  emptyset:'the empty set',varnothing:'the empty set',forall:'for all',exists:'there exists',nexists:'there does not exist',
  neg:'not',lnot:'not',land:'and',wedge:'and',lor:'or',vee:'or',infty:'infinity',partial:'partial',nabla:'nabla',
  ell:'ell',hbar:'h bar',mid:'such that',ldots:'dot dot dot',dots:'dot dot dot',cdots:'dot dot dot',vdots:'dot dot dot',
  ddots:'dot dot dot',ll:'is much less than',gg:'is much greater than',perp:'is perpendicular to',parallel:'is parallel to',
  angle:'angle',circ:'composed with',oplus:'direct sum',otimes:'tensor',star:'star',ast:'star',bullet:'bullet',
  dagger:'dagger',Re:'real part',Im:'imaginary part',top:'transpose',prime:'prime',degree:'degrees',
  therefore:'therefore',because:'because',aleph:'aleph',triangle:'triangle',Box:'end of proof',square:'end of proof',
  langle:'',rangle:'',lceil:'',rceil:'',lfloor:'',rfloor:'',colon:'such that',
  quad:'',qquad:'',',':'',';':'',':':'','!':'',' ':'',displaystyle:'',textstyle:'',scriptstyle:'',limits:'',nolimits:'',
  nonumber:'',notag:'',centering:'',big:'',Big:'',bigg:'',Bigg:'',bigl:'',bigr:'',Bigl:'',Bigr:'',biggl:'',biggr:'',
  '{':'open brace','}':'close brace','%':'percent','$':'dollars','&':'and','_':'underscore','#':'number','|':'norm',
  '\\':',',newline:',',cr:','
};
const FUNCS = new Set('sin cos tan cot sec csc sinh cosh tanh coth arcsin arccos arctan log exp det dim ker deg gcd lcm arg Pr hom'.split(' '));
const FUNC_SAY = { ln:'natural log', Pr:'probability' };
const LIMITED = { // commands that take _ and ^ limits
  sum:'the sum', prod:'the product', coprod:'the coproduct', int:'the integral', iint:'the double integral',
  iiint:'the triple integral', oint:'the contour integral', bigcup:'the union', bigcap:'the intersection',
  bigoplus:'the direct sum', bigotimes:'the tensor product', lim:'the limit', limsup:'the limit superior',
  liminf:'the limit inferior', max:'the max', min:'the min', sup:'the supremum', inf:'the infimum'
};
const BLACKBOARD = { R:'the real numbers', N:'the natural numbers', Z:'the integers', Q:'the rational numbers', C:'the complex numbers' };
const ACCENT = { hat:'hat', widehat:'hat', bar:'bar', overline:'bar', tilde:'tilde', widetilde:'tilde', dot:'dot', ddot:'double dot', underline:'underlined' };
const TEXTLIKE = new Set(['text','textrm','textbf','textit','textsf','texttt','mbox','hbox','emph','textnormal']);
const WRAPLIKE = new Set(['mathrm','mathbf','mathit','mathsf','mathtt','mathcal','mathscr','mathfrak','operatorname','bm','boldsymbol','boxed','mathop','left','right']);
const SWALLOW1 = new Set(['label','tag','color','hspace','vspace','phantom','hphantom','vphantom','textcolor','ref','eqref']);
const MATRIX = new Set(['matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','smallmatrix']);
const NTH = { 3:'cube', 4:'fourth', 5:'fifth' };

function clean(s) {
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/([,;])(\s*[,;])+/g, '$1').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
}

function texToSpeech(src) {
  const s = src;
  let i = 0;
  const out = [];
  const bars = (s.match(/(^|[^\\])\|/g) || []).length;
  let absOpen = false;

  const isWs = c => c === ' ' || c === '\n' || c === '\t' || c === '\r';
  const skipWs = () => { while (i < s.length && isWs(s[i])) i++; };
  const isLetter = c => /[A-Za-z]/.test(c);

  function readName() { // i is just after the backslash
    let j = i;
    if (j < s.length && isLetter(s[j])) { while (j < s.length && isLetter(s[j])) j++; } else j = Math.min(i + 1, s.length);
    const n = s.slice(i, j); i = j; return n;
  }
  function readBraced() { // i at '{'
    let depth = 0; const st = i + 1;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { const r = s.slice(st, i); i++; return r; } }
    }
    return s.slice(st);
  }
  function arg() {
    skipWs();
    if (i >= s.length) return { raw: '', sp: '' };
    let raw;
    if (s[i] === '{') raw = readBraced();
    else if (s[i] === '\\') { i++; raw = '\\' + readName(); }
    else raw = s[i++];
    return { raw, sp: texToSpeech(raw) };
  }
  const simple = a => /^\s*(\\[a-zA-Z]+|[A-Za-z0-9]{1,3})\s*$/.test(a.raw) || a.sp.split(' ').length <= 1;
  function optArg() {
    skipWs();
    if (s[i] === '[') { const e = s.indexOf(']', i); if (e > 0) { const r = s.slice(i + 1, e); i = e + 1; return r; } }
    return null;
  }
  function delim() {
    skipWs();
    if (i >= s.length) return;
    if (s[i] === '\\') { i++; const n = readName(); if (n === 'vert' || n === 'lvert' || n === 'rvert') bar('|'); else if (n === 'Vert' || n === '|' || n === 'lVert' || n === 'rVert') bar('||'); }
    else if (s[i] === '|') { i++; bar('|'); }
    else i++;
  }
  function bar(kind) {
    if (kind === '||') { out.push(absOpen === 'n' ? (absOpen = false, 'end norm') : (absOpen = 'n', 'norm of')); return; }
    if (bars < 2 || bars % 2) { out.push('such that'); return; }
    if (!absOpen) { out.push('absolute value of'); absOpen = true; } else { out.push('end absolute value'); absOpen = false; }
  }
  function limits() {
    let lo = null, hi = null;
    for (let k = 0; k < 2; k++) {
      skipWs();
      if (s[i] === '_' && lo === null) { i++; lo = arg(); }
      else if (s[i] === '^' && hi === null) { i++; hi = arg(); }
      else break;
    }
    return { lo, hi };
  }
  function env(name) {
    const endTag = '\\end{' + name + '}';
    const e = s.indexOf(endTag, i);
    const body = e < 0 ? s.slice(i) : s.slice(i, e);
    i = e < 0 ? s.length : e + endTag.length;
    const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
    if (MATRIX.has(name)) {
      const parts = rows.map((r, k) => 'row ' + (k + 1) + ': ' + r.split('&').map(c => texToSpeech(c)).join(', '));
      return 'the matrix with ' + rows.length + (rows.length === 1 ? ' row. ' : ' rows. ') + parts.join('. ') + '. end matrix';
    }
    if (name === 'cases') {
      return 'cases. ' + rows.map((r, k) => 'case ' + (k + 1) + ': ' + r.split('&').map(c => texToSpeech(c)).join(', ')).join('. ') + '. end cases';
    }
    // aligned / array / split / gathered etc: speak row by row
    return rows.map(r => texToSpeech(r.replace(/&/g, ' '))).join('. ');
  }

  while (i < s.length) {
    const c = s[i];
    if (isWs(c)) { i++; continue; }
    if (c === '{') { out.push(texToSpeech(readBraced())); continue; }
    if (c === '}') { i++; continue; }
    if (c === '^') {
      i++; const a = arg(); const r = a.raw.trim();
      if (r === '2') out.push('squared');
      else if (r === '3') out.push('cubed');
      else if (r === '\\prime' || r === "'") out.push('prime');
      else if (r === '\\circ') out.push('degrees');
      else if (r === '\\top' || r === 'T') out.push('transpose');
      else if (r === '*' || r === '\\ast') out.push('star');
      else if (r === '-1') out.push('inverse');
      else out.push('to the power ' + a.sp + (simple(a) ? '' : ', end power'));
      continue;
    }
    if (c === '_') { i++; const a = arg(); out.push('sub ' + a.sp + (simple(a) ? '' : ', end sub')); continue; }
    if (c === "'") { i++; out.push('prime'); continue; }
    if (c === '\\') {
      i++;
      const n = readName();
      if (n === 'frac' || n === 'dfrac' || n === 'tfrac' || n === 'cfrac') {
        const a = arg(), b = arg();
        out.push(simple(a) && simple(b) ? a.sp + ' over ' + b.sp : 'the fraction ' + a.sp + ' over ' + b.sp + ', end fraction');
      } else if (n === 'binom' || n === 'dbinom') { const a = arg(), b = arg(); out.push(a.sp + ' choose ' + b.sp); }
      else if (n === 'sqrt') {
        const idx = optArg(); const a = arg();
        let w = 'square root of';
        if (idx !== null) w = (NTH[idx.trim()] ? NTH[idx.trim()] + ' root of' : texToSpeech(idx) + 'th root of');
        out.push(w + ' ' + a.sp + (simple(a) ? '' : ', end root'));
      }
      else if (LIMITED[n]) {
        const { lo, hi } = limits();
        let t = LIMITED[n];
        const big = n !== 'lim' && n !== 'limsup' && n !== 'liminf' && n !== 'max' && n !== 'min' && n !== 'sup' && n !== 'inf';
        if (lo && hi) t += ' from ' + lo.sp + ' to ' + hi.sp;
        else if (hi) t += ' to ' + hi.sp;
        else if (lo) {
          if (n === 'lim' || n === 'limsup' || n === 'liminf') t += ' as ' + lo.sp;
          else if (big && /=/.test(lo.raw)) t += ' from ' + lo.sp;
          else t += ' over ' + lo.sp;
        }
        out.push(t + (big ? ' of' : ''));
      }
      else if (n === 'mathbb') { const a = arg(); out.push(BLACKBOARD[a.raw.trim()] || a.sp); }
      else if (TEXTLIKE.has(n)) { const a = arg(); out.push(a.raw.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ')); }
      else if (n === 'vec') { const a = arg(); out.push('vector ' + a.sp); }
      else if (ACCENT[n]) { const a = arg(); out.push(a.sp + ' ' + ACCENT[n]); }
      else if (n === 'pmod') { const a = arg(); out.push('mod ' + a.sp); }
      else if (n === 'bmod' || n === 'mod') out.push('mod');
      else if (n === 'left' || n === 'right') delim();
      else if (n === 'bigl' || n === 'bigr' || n === 'Bigl' || n === 'Bigr' || n === 'biggl' || n === 'biggr' || n === 'big' || n === 'Big' || n === 'bigg' || n === 'Bigg') delim();
      else if (WRAPLIKE.has(n)) { const a = arg(); out.push(a.sp); }
      else if (SWALLOW1.has(n)) arg();
      else if (n === 'begin') {
        const nm = readBraced();
        if (MATRIX.has(nm) || nm === 'cases' || /^(aligned|align|alignat|gathered|gather|split|array|eqnarray|multline|equation|subarray)\*?$/.test(nm)) out.push(env(nm));
      }
      else if (n === 'end') readBraced();
      else if (n === '|') bar('||');
      else if (n === 'vert' || n === 'lvert' || n === 'rvert') bar('|');
      else if (n === 'Vert' || n === 'lVert' || n === 'rVert') bar('||');
      else if (GREEK[n]) out.push(GREEK[n]);
      else if (Object.prototype.hasOwnProperty.call(SYM, n)) out.push(SYM[n]);
      else if (FUNCS.has(n)) out.push(n);
      else if (FUNC_SAY[n]) out.push(FUNC_SAY[n]);
      else if (n.length > 1) out.push(n);
      continue;
    }
    if (/[0-9]/.test(c)) { const m = /^[0-9]+(?:\.[0-9]+)?/.exec(s.slice(i)); out.push(m[0]); i += m[0].length; continue; }
    if (isLetter(c)) { out.push(c); i++; continue; }
    i++;
    switch (c) {
      case '=': out.push('equals'); break;
      case '+': out.push('plus'); break;
      case '-': case '−': out.push('minus'); break;
      case '<': out.push('is less than'); break;
      case '>': out.push('is greater than'); break;
      case '/': out.push('slash'); break;
      case '*': out.push('times'); break;
      case '!': out.push('factorial'); break;
      case '|': bar('|'); break;
      case ':': out.push('colon'); break;
      case '&': out.push(','); break;
      case '(': case ')': case '[': case ']': case ',': case ';': out.push(','); break;
      default: break;
    }
  }
  return clean(out.join(' '));
}

/* ---------- LaTeX source -> Markdown ---------- */

function texToMd(src) {
  let t = src.replace(/\r\n?/g, '\n').replace(/(^|[^\\])%.*$/gm, '$1');
  const title = /\\title\{([^{}]*)\}/.exec(t);
  const doc = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(t);
  if (doc) t = doc[1];
  t = t.replace(/\\(maketitle|tableofcontents|newpage|clearpage|centering|noindent|bigskip|medskip|smallskip)\b/g, '');
  t = t.replace(/\\begin\{abstract\}/g, '\n\n**Abstract.** ').replace(/\\end\{abstract\}/g, '\n\n');
  const head = { chapter: '#', section: '##', subsection: '###', subsubsection: '####' };
  t = t.replace(/\\(chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, k, x) => '\n\n' + head[k] + ' ' + x.replace(/\s+/g, ' ') + '\n\n');
  t = t.replace(/\\(paragraph|subparagraph)\*?\{([^{}]*)\}/g, '\n\n**$2** ');
  t = t.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (m, kind, body) =>
    '\n\n' + body.replace(/\\item\s*(\[[^\]]*\])?/g, kind === 'itemize' ? '\n- ' : '\n1. ') + '\n\n');
  t = t.replace(/\\begin\{(theorem|lemma|proposition|corollary|definition|proof|remark|example|claim|conjecture)\}(\[([^\]]*)\])?/g,
    (m, k, o, nm) => '\n\n**' + k[0].toUpperCase() + k.slice(1) + (nm ? ' (' + nm + ')' : '') + '.** ');
  t = t.replace(/\\end\{(theorem|lemma|proposition|corollary|definition|proof|remark|example|claim|conjecture)\}/g, '\n\n');
  for (let k = 0; k < 3; k++) {
    t = t.replace(/\\textbf\{([^{}]*)\}/g, '**$1**').replace(/\\(emph|textit)\{([^{}]*)\}/g, '*$2*')
      .replace(/\\texttt\{([^{}]*)\}/g, '`$1`').replace(/\\footnote\{([^{}]*)\}/g, ' ($1)');
  }
  t = t.replace(/\\cite[a-z]*\{[^{}]*\}/g, '[citation]').replace(/\\(?:eq)?ref\{[^{}]*\}/g, '(ref)')
    .replace(/\\label\{[^{}]*\}/g, '').replace(/``/g, '“').replace(/''/g, '”').replace(/~/g, ' ')
    .replace(/\\%/g, '%').replace(/\\&/g, '&').replace(/\\#/g, '#');
  if (title) t = '# ' + title[1] + '\n\n' + t;
  return t;
}

/* ---------- math extraction ---------- */

const MATH_RE = new RegExp([
  '\\$\\$([\\s\\S]+?)\\$\\$',
  '\\\\\\[([\\s\\S]+?)\\\\\\]',
  '\\\\begin\\{(equation\\*?|align\\*?|gather\\*?|multline\\*?|eqnarray\\*?|displaymath)\\}([\\s\\S]+?)\\\\end\\{\\3\\}',
  '\\\\\\(([\\s\\S]+?)\\\\\\)',
  '(?<![\\\\$])\\$(?![\\s$])((?:\\\\.|[^$\\\\])+?)(?<![\\s\\\\])\\$(?!\\d)'
].join('|'), 'g');

function extractMath(text0) {
  const maths = [], codes = [];
  // hide code first so `$HOME` or `$1 $2` in a shell snippet is never mistaken for math
  const text = text0.replace(/(```|~~~)[\s\S]*?(\1|$)|`[^`\n]+`/g, m => { codes.push(m); return '\u0001' + (codes.length - 1) + '\u0001'; });
  const unhide = s => s.replace(/\u0001(\d+)\u0001/g, (m, i) => codes[+i]);
  const out = text.replace(MATH_RE, (m, dd, br, envName, envBody, par, inl) => {
    let tex, display = true;
    if (dd != null) tex = dd;
    else if (br != null) tex = br;
    else if (envName != null) {
      const nm = envName.replace('*', '');
      tex = envBody.replace(/\\label\{[^{}]*\}/g, '');
      if (nm === 'align' || nm === 'eqnarray' || nm === 'multline') tex = '\\begin{aligned}' + tex.replace(/&=?&/g, '&=') + '\\end{aligned}';
      else if (nm === 'gather') tex = '\\begin{gathered}' + tex + '\\end{gathered}';
    } else if (par != null) { tex = par; display = false; }
    else { tex = inl; display = false; }
    maths.push({ tex: tex.trim(), display });
    const tok = '⟦' + (maths.length - 1) + '⟧';
    return display ? '\n\n' + tok + '\n\n' : tok;
  });
  maths.forEach(m => { m.tex = unhide(m.tex); });
  return { text: unhide(out), maths };
}

/* ---------- sentences ---------- */

const ABBR = new Set(('e.g i.e fig figs eq eqs sec secs vs etc al dr mr mrs ms prof no nos cf ch thm lem def prop cor approx resp ' +
  'vol pp p st jr sr inc ca viz ex eg ie').split(' '));

function splitSentences(s) {
  const out = [];
  const re = /[.!?]+["')\]”’]*\s+/g;
  let start = 0, m;
  while ((m = re.exec(s))) {
    const before = s.slice(start, m.index);
    const next = s[m.index + m[0].length];
    if (next === undefined) break;
    const mm = /([A-Za-z][A-Za-z.]*)$/.exec(before + m[0].trim().charAt(0));
    const w = mm ? mm[1].replace(/\.$/, '').toLowerCase() : '';
    const lastWord = /([A-Za-z.]+)$/.exec(before);
    const lw = lastWord ? lastWord[1].toLowerCase() : '';
    const endsDot = m[0].charAt(0) === '.' && m[0].replace(/\s+$/, '').length === 1;
    if (endsDot && (ABBR.has(lw) || ABBR.has(w) || /^[A-Z]$/.test(lastWord ? lastWord[1] : '') && /(^|\s)[A-Z]$/.test(before))) continue;
    if (/[a-z]/.test(next) && endsDot) continue;
    out.push(s.slice(start, m.index + m[0].trimEnd().length).trim());
    start = m.index + m[0].length;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/* ---------- block parsing ---------- */

const LI_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const isBlank = l => /^\s*$/.test(l);

function parseBlocks(text, isDisplay) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  const blockStart = l => /^\s*(```|~~~)/.test(l) || /^#{1,6}\s/.test(l) || LI_RE.test(l) || /^\s*>/.test(l) || HR_RE.test(l) || /^\s*<[a-zA-Z\/]/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    let m;
    if (/^\s*(```|~~~)/.test(l)) {
      const fence = l.trim().slice(0, 3), buf = [l]; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
      if (i < lines.length) buf.push(lines[i++]);
      out.push({ t: 'raw', md: buf.join('\n') }); continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { out.push({ t: 'h', level: m[1].length, md: m[2] }); i++; continue; }
    if (HR_RE.test(l)) { out.push({ t: 'raw', md: '---' }); i++; continue; }
    if ((m = /^\s*⟦(\d+)⟧\s*$/.exec(l)) && isDisplay(+m[1])) { out.push({ t: 'math', idx: +m[1] }); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const buf = []; while (i < lines.length && /\|/.test(lines[i]) && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push({ t: 'raw', md: buf.join('\n') }); continue;
    }
    if (/^\s*<[a-zA-Z\/]/.test(l)) { const buf = []; while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]); out.push({ t: 'raw', md: buf.join('\n') }); continue; }
    if ((m = LI_RE.exec(l))) {
      let md = m[3]; const ordered = /\d/.test(m[2]); const depth = Math.min(3, Math.floor(m[1].replace(/\t/g, '    ').length / 2)); i++;
      while (i < lines.length && !isBlank(lines[i]) && !blockStart(lines[i])) md += ' ' + lines[i++].trim();
      out.push({ t: 'li', ordered, depth, md }); continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ t: 'quote', md: buf.join(' ') }); continue;
    }
    const buf = [l.trim()]; i++;
    while (i < lines.length && !isBlank(lines[i]) && !blockStart(lines[i]) && !/^\s*⟦\d+⟧\s*$/.test(lines[i])) buf.push(lines[i++].trim());
    out.push({ t: 'p', md: buf.join(' ') });
  }
  return out;
}

/* ---------- html helpers ---------- */

function htmlToText(h) {
  return h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


/* ---------- table of contents ---------- */

function plainTitle(md) {
  return md.replace(/⟦\d+⟧/g, ' ').replace(/\$[^$]*\$/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`\\]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}
// headings of one chunk of source text (skips code blocks); n = which repeat of the same title this is
function scanHeadings(text) {
  const out = [], cnt = {}; let fence = null;
  for (const line of text.split('\n')) {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) { fence = fence ? (f[1] === fence ? null : fence) : f[1]; continue; }
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const title = plainTitle(m[2]); if (!title || !/[A-Za-z0-9]/.test(title)) continue;
    cnt[title] = cnt[title] == null ? 0 : cnt[title] + 1;
    out.push({ level: m[1].length, title, n: cnt[title] });
  }
  return out;
}

/* ---------- document builder ---------- */

function buildDocument(raw, env) {
  const { renderMath, parseInline, parseBlock } = env;
  const text0 = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  const { text, maths } = extractMath(text0);
  const blocks = parseBlocks(text, i => maths[i] && maths[i].display);
  const units = [], headings = [];
  const TOK = /⟦(\d+)⟧/g;
  const speechCache = {};
  const mathSpeech = i => speechCache[i] != null ? speechCache[i] : (speechCache[i] = texToSpeech(maths[i].tex));
  // lazyMath: leave a placeholder and let the page draw it when scrolled near (huge books create millions of nodes otherwise)
  const mathHtml = i => env.lazyMath ? '<span class="mj" data-m="' + i + '"></span>' : renderMath(maths[i].tex, maths[i].display);

  function inline(md) {
    const h = parseInline(md);
    const speak = clean(htmlToText(h).replace(TOK, (m, i) => ' ' + mathSpeech(+i) + ' '));
    const html = h.replace(TOK, (m, i) => '<span class="m">' + mathHtml(+i) + '</span>');
    return { html, speak };
  }
  function unit(md, forceWhole, suffix) {
    const parts = forceWhole ? [md] : splitSentences(md);
    return parts.map(p => {
      const r = inline(p);
      let sp = r.speak; if (suffix && sp && !/[.!?:]$/.test(sp)) sp += suffix;
      if (!sp || !/[A-Za-z0-9]/.test(sp)) return r.html;
      units.push({ speak: sp });
      return '<span class="s" data-i="' + (units.length - 1) + '">' + r.html + '</span>';
    }).join(' ');
  }

  let html = '', openList = null;
  const closeList = () => { if (openList) { html += '</' + openList + '>'; openList = null; } };
  for (const b of blocks) {
    if (b.t !== 'li') closeList();
    if (b.t === 'h') { const u0 = units.length; html += '<h' + b.level + '>' + unit(b.md, true, '.') + '</h' + b.level + '>'; headings.push({ level: b.level, title: plainTitle(b.md), unit: units.length > u0 ? u0 : -1 }); }
    else if (b.t === 'p') html += '<p>' + unit(b.md) + '</p>';
    else if (b.t === 'quote') html += '<blockquote>' + unit(b.md) + '</blockquote>';
    else if (b.t === 'li') {
      const tag = b.ordered ? 'ol' : 'ul';
      if (openList !== tag) { closeList(); html += '<' + tag + '>'; openList = tag; }
      html += '<li class="d' + b.depth + '">' + unit(b.md) + '</li>';
    } else if (b.t === 'math') {
      units.push({ speak: 'Equation. ' + mathSpeech(b.idx) + '.' });
      html += '<div class="s mathblock" data-i="' + (units.length - 1) + '">' + mathHtml(b.idx) + '</div>';
    } else html += '<div class="rawblock">' + parseBlock(b.md) + '</div>';
  }
  closeList();
  return { html, units, maths, headings };
}


/* ---------- chunking (a 900-page book is built and shown a section at a time) ---------- */

function splitChunks(src, minChars, maxChars) {
  minChars = minChars || 6000; maxChars = maxChars || 30000;
  const lines = src.split('\n');
  const chunks = [];
  let cur = [], size = 0, fence = null, display = false, envOpen = false;
  const flush = () => { if (cur.length) { chunks.push(cur.join('\n')); cur = []; size = 0; } };
  for (const line of lines) {
    const clean = !fence && !display && !envOpen;
    if (clean && size >= minChars && /^#{1,2}\s/.test(line)) flush();
    else if (clean && size >= maxChars && /^\s*$/.test(line)) { cur.push(line); flush(); continue; }
    cur.push(line); size += line.length + 1;
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) fence = fence ? (f[1] === fence ? null : fence) : f[1];
    if (!fence) {
      if (((line.match(/\$\$/g) || []).length) % 2) display = !display;
      if (/\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}/.test(line) && !/\\end\{/.test(line)) envOpen = true;
      else if (/\\end\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}/.test(line)) envOpen = false;
      if (/^\s*\\\[\s*$/.test(line)) display = true; else if (/^\s*\\\]\s*$/.test(line)) display = false;
    }
  }
  flush();
  return chunks;
}

/* ---------- TTS chunking ---------- */

function chunkForTTS(t, max) {
  max = max || 280;
  if (t.length <= max) return [t];
  const pieces = t.split(/(?<=[,;:])\s+/), out = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && (cur + ' ' + p).length > max) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  const fin = [];
  for (const c of out) { if (c.length <= max * 1.5) fin.push(c); else for (let k = 0; k < c.length; k += max) fin.push(c.slice(k, k + max)); }
  return fin;
}

const api = { texToSpeech, texToMd, extractMath, splitSentences, parseBlocks, buildDocument, chunkForTTS, splitChunks, scanHeadings, plainTitle, esc };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BookCore = api;
})(typeof self !== 'undefined' ? self : this);
