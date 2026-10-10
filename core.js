/* Book Reader core: pure text logic (no DOM). Works in browser and node. */
(function (root) {
'use strict';

/* ---------- math -> speech ----------
   Three steps: lex (characters -> tokens), parse (tokens -> a tree that knows about groups, fractions,
   scripts, brackets, environments), speak (tree -> words, using context: f(x) is "f of x", P(A|B) is
   "P of A given B", {x : x>0} is "the set of x such that x is greater than 0", and so on). */

const GREEK = {
  alpha:'alpha',beta:'beta',gamma:'gamma',delta:'delta',epsilon:'epsilon',varepsilon:'epsilon',zeta:'zeta',eta:'eta',
  theta:'theta',vartheta:'theta',iota:'iota',kappa:'kappa',varkappa:'kappa',lambda:'lambda',mu:'mu',nu:'nu',xi:'xi',pi:'pi',varpi:'pi',
  rho:'rho',varrho:'rho',sigma:'sigma',varsigma:'sigma',tau:'tau',upsilon:'upsilon',phi:'phi',varphi:'phi',chi:'chi',
  psi:'psi',omega:'omega',Gamma:'capital gamma',Delta:'capital delta',Theta:'capital theta',Lambda:'capital lambda',
  Xi:'capital xi',Pi:'capital pi',Sigma:'capital sigma',Upsilon:'capital upsilon',Phi:'capital phi',Psi:'capital psi',
  Omega:'capital omega'
};
// relations and arrows
const RELS = {
  le:'is less than or equal to',leq:'is less than or equal to',ge:'is greater than or equal to',geq:'is greater than or equal to',
  ne:'is not equal to',neq:'is not equal to',approx:'is approximately equal to',sim:'is similar to',simeq:'is similar or equal to',
  cong:'is congruent to',equiv:'is equivalent to',propto:'is proportional to',doteq:'is equal to',
  to:'goes to',rightarrow:'goes to',longrightarrow:'goes to',mapsto:'maps to',longmapsto:'maps to',
  Rightarrow:'implies',implies:'implies',Longrightarrow:'implies',Leftarrow:'is implied by',impliedby:'is implied by',
  Leftrightarrow:'if and only if',iff:'if and only if',leftarrow:'left arrow',gets:'left arrow',leftrightarrow:'two-way arrow',
  in:'is in',notin:'is not in',ni:'contains',subset:'is a subset of',subseteq:'is a subset of or equal to',subsetneq:'is a proper subset of',
  supset:'is a superset of',supseteq:'is a superset of or equal to',ll:'is much less than',gg:'is much greater than',
  perp:'is perpendicular to',parallel:'is parallel to',vdash:'proves',models:'models',nless:'is not less than',ngtr:'is not greater than',
  nleq:'is not less than or equal to',ngeq:'is not greater than or equal to',nsim:'is not similar to',lesssim:'is at most about',gtrsim:'is at least about'
};
// binary operators and other symbols
const OPS = {
  cdot:'dot',times:'times',div:'divided by',pm:'plus or minus',mp:'minus or plus',circ:'composed with',ast:'star',star:'star',bullet:'bullet',
  oplus:'direct sum',otimes:'tensor',ominus:'circled minus',odot:'circled dot',cup:'union',cap:'intersection',setminus:'minus',
  land:'and',wedge:'wedge',lor:'or',vee:'or',uplus:'multiset union',sqcup:'square union',sqcap:'square intersection',
  amalg:'coproduct',dagger:'dagger',ddagger:'double dagger'
};
const SYMS = {
  infty:'infinity',partial:'partial',nabla:'nabla',ell:'ell',hbar:'h bar',emptyset:'the empty set',varnothing:'the empty set',
  forall:'for all',exists:'there exists',nexists:'there does not exist',neg:'not',lnot:'not',aleph:'aleph',angle:'angle',
  triangle:'triangle',therefore:'therefore',because:'because',top:'transpose',bot:'bottom',prime:'prime',Re:'real part',Im:'imaginary part',
  ldots:'dot dot dot',dots:'dot dot dot',cdots:'dot dot dot',vdots:'dot dot dot',ddots:'dot dot dot',dotsc:'dot dot dot',dotsb:'dot dot dot',
  degree:'degrees',Box:'end of proof',square:'end of proof',qed:'end of proof',blacksquare:'end of proof',
  '{':'open brace','}':'close brace','%':'percent','$':'dollars','&':'and','_':'underscore','#':'number','\\':','
};
const SPACES = new Set([',',';',':','!',' ','quad','qquad','enspace','thinspace','medspace','thickspace','negthinspace','displaystyle','textstyle','scriptstyle',
  'scriptscriptstyle','limits','nolimits','nonumber','notag','centering','left','right','big','Big','bigg','Bigg','bigl','bigr','Bigl','Bigr','biggl','biggr',
  'protect','relax','allowbreak','hfill','vfill','newline','cr','label','tag','vphantom','hphantom','phantom','smash','mathstrut','strut']);
const FUNCS = { sin:'sine',cos:'cosine',tan:'tangent',cot:'cotangent',sec:'secant',csc:'cosecant',sinh:'hyperbolic sine',cosh:'hyperbolic cosine',
  tanh:'hyperbolic tangent',coth:'hyperbolic cotangent',arcsin:'arc sine',arccos:'arc cosine',arctan:'arc tangent',log:'log',lg:'log base 2',ln:'natural log',
  exp:'exponential',det:'determinant',dim:'dimension',ker:'kernel',deg:'degree',gcd:'g c d',lcm:'l c m',arg:'arg',Pr:'probability',hom:'hom',tr:'trace',
  rank:'rank',sgn:'sign',Var:'variance',Cov:'covariance',mod:'mod',bmod:'mod',im:'image',id:'identity',Tr:'trace',diag:'diagonal',span:'span' };
const BIG = { sum:'the sum',prod:'the product',coprod:'the coproduct',int:'the integral',iint:'the double integral',iiint:'the triple integral',
  oint:'the contour integral',bigcup:'the union',bigcap:'the intersection',bigoplus:'the direct sum',bigotimes:'the tensor product',
  bigvee:'the join',bigwedge:'the meet',bigsqcup:'the disjoint union',
  lim:'the limit',limsup:'the limit superior',liminf:'the limit inferior',max:'the max',min:'the min',sup:'the supremum',inf:'the infimum',
  argmax:'the argmax',argmin:'the argmin' };
const BIG_SUM = new Set(['sum','prod','coprod','bigcup','bigcap','bigoplus','bigotimes','bigvee','bigwedge','bigsqcup']);
const BIG_INT = new Set(['int','iint','iiint','oint']);
const BIG_LIM = new Set(['lim','limsup','liminf']);
const BLACKBOARD = { R:'the real numbers',N:'the natural numbers',Z:'the integers',Q:'the rational numbers',C:'the complex numbers',
  E:'expectation',P:'probability',V:'variance',1:'indicator',H:'H',F:'F',S:'S',T:'T',A:'A',B:'B',D:'D',K:'K',L:'L',M:'M' };
const ACCENT = { hat:'hat',widehat:'hat',bar:'bar',overline:'bar',tilde:'tilde',widetilde:'tilde',dot:'dot',ddot:'double dot',dddot:'triple dot',check:'check',breve:'breve',acute:'acute',grave:'grave' };
const STYLE_WORD = new Set(['mathrm','mathsf','mathtt','operatorname','textrm']); // multi-letter content is a word: \mathrm{Var} -> "Var"
const STYLE_PLAIN = new Set(['mathbf','mathit','boldsymbol','bm','boxed','mathop','mathbfit','pmb','mathnormal','textstyle']);
const STYLE_SCRIPT = new Set(['mathcal','mathscr']);
const ARG_IGNORE = new Set(['label','tag','color','hspace','vspace','hphantom','vphantom','phantom','ref','eqref','vspace*','hspace*','smash','mathstrut']);
const ORD = { 4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth' };
const FRACW = { 2:'half',3:'third',4:'quarter',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth' };
const MATRIX = new Set(['matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','smallmatrix']);
const FN_LETTERS = /^[fghFGHpPqQOφψ]$/;           // single letters that usually name functions
const STAT_WORDS = new Set(['E','P','Var','Cov','Pr','expectation','probability','variance','covariance']);

/* ---- 1. lex ---- */
function lexMath(s) {
  s = s.replace(/(\d)\{,\}(\d)/g, '$1,$2'); // TeX writes 1{,}000
  const toks = [], n = s.length;
  const RAWARG = new Set(['text','textrm','textbf','textit','textsf','texttt','mbox','hbox','textnormal','emph','operatorname','begin','end']);
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c) || c === '~') { i++; continue; }
    if (c === '\\') {
      i++; let j = i;
      if (j < n && /[A-Za-z]/.test(s[j])) { while (j < n && /[A-Za-z]/.test(s[j])) j++; } else j = Math.min(i + 1, n);
      const name = s.slice(i, j); i = j;
      if (name === 'operatorname' && s[i] === '*') i++;
      if (RAWARG.has(name)) {
        let k = i; while (k < n && /\s/.test(s[k])) k++;
        if (s[k] === '{') {
          let d = 0, e = k;
          for (; e < n; e++) { if (s[e] === '\\') { e++; continue; } if (s[e] === '{') d++; else if (s[e] === '}') { d--; if (d === 0) break; } }
          const raw = s.slice(k + 1, e); i = Math.min(e + 1, n);
          if (name === 'begin' || name === 'end') toks.push({ k: 'cmd', n: name, env: raw.trim() });
          else toks.push({ k: name === 'operatorname' ? 'opname' : 'text', v: raw });
          continue;
        }
      }
      toks.push({ k: 'cmd', n: name }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      const m = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
      toks.push({ k: 'num', v: m[0] }); i += m[0].length; continue;
    }
    if (/[A-Za-z]/.test(c)) { toks.push({ k: 'sym', v: c }); i++; continue; }
    if (c === 'α' || /[Ͱ-Ͽ]/.test(c)) { toks.push({ k: 'sym', v: c }); i++; continue; } // greek typed directly
    if (c === '{') toks.push({ k: 'lb' }); else if (c === '}') toks.push({ k: 'rb' });
    else if (c === '^') toks.push({ k: 'sup' }); else if (c === '_') toks.push({ k: 'sub' });
    else if (c === "'") toks.push({ k: 'prime' }); else if (c === '&') toks.push({ k: 'amp' });
    else toks.push({ k: 'ch', v: c });
    i++;
  }
  return toks;
}

/* ---- 2. parse ---- */
const OPEN_CMD = { lvert: 'abs', lVert: 'norm', langle: 'angle', lfloor: 'floor', lceil: 'ceil', '{': 'set' };
const CLOSE_CMD = { rvert: 'abs', rVert: 'norm', rangle: 'angle', rfloor: 'floor', rceil: 'ceil', '}': 'set' };

function parseMath(toks) {
  let p = 0;
  const isCh = (t, v) => t && t.k === 'ch' && t.v === v;
  const isCmd = (t, n) => t && t.k === 'cmd' && t.n === n;
  const isBar = t => isCh(t, '|') || (t && t.k === 'cmd' && t.n === 'vert');
  const isNormBar = t => t && t.k === 'cmd' && (t.n === '|' || t.n === 'Vert');

  function parseUntil(isEnd) {
    const items = [];
    while (p < toks.length && !isEnd(toks[p])) { const it = parseScripted(); if (it) items.push(it); }
    return items;
  }
  function parseScripted() {
    let node = parseAtom();
    if (!node) return null;
    let sup = null, sub = null, primes = 0;
    for (;;) {
      const t = toks[p]; if (!t) break;
      if (t.k === 'prime') { p++; primes++; continue; }
      if (t.k === 'sup' && !sup) { p++; sup = parseArg(true); continue; }
      if (t.k === 'sub' && !sub) { p++; sub = parseArg(true); continue; }
      break;
    }
    return sup || sub || primes ? { t: 'scr', base: node, sup, sub, primes } : node;
  }
  function parseArg(script) {
    const t = toks[p];
    if (!t) return { t: 'group', items: [] };
    if (t.k === 'lb') return parseGroup();
    if (t.k === 'num' && t.v.length > 1 && !/[.,]/.test(t.v)) { // TeX takes one digit: \frac13 is 1 over 3, x^23 is x^2 then 3
      toks.splice(p, 1, { k: 'num', v: t.v[0] }, { k: 'num', v: t.v.slice(1) });
    }
    return parseAtom() || { t: 'group', items: [] };
  }
  function parseGroup() {
    p++; // {
    const items = parseUntil(t => t.k === 'rb');
    if (p < toks.length) p++; // }
    return { t: 'group', items };
  }
  const argItems = a => (a && a.t === 'group' ? a.items : a ? [a] : []);

  function hasClosing(from, isClose) { // is there a matching closer later at the same nesting level?
    let depth = 0;
    for (let j = from; j < toks.length; j++) {
      const t = toks[j];
      if (t.k === 'lb' || isCmd(t, 'left')) depth++;
      else if (t.k === 'rb' || isCmd(t, 'right')) { if (depth === 0) return false; depth--; }
      else if (depth === 0 && isClose(t)) return true;
    }
    return false;
  }
  function delimKind(t) { // kind of bracket named by a token after \left / \right
    if (!t) return 'none';
    if (t.k === 'ch') return t.v === '(' || t.v === ')' ? 'paren' : t.v === '[' || t.v === ']' ? 'brack' : t.v === '|' ? 'abs' : 'none';
    if (t.k === 'cmd') return OPEN_CMD[t.n] || CLOSE_CMD[t.n] || (t.n === 'vert' ? 'abs' : t.n === '|' || t.n === 'Vert' ? 'norm' : 'none');
    return 'none';
  }
  function parseEnv(name) {
    let depth = 1, j = p; const body = [];
    for (; j < toks.length; j++) {
      const t = toks[j];
      if (isCmd(t, 'begin') && t.env === name) depth++;
      else if (isCmd(t, 'end') && t.env === name) { depth--; if (depth === 0) break; }
      body.push(t);
    }
    p = Math.min(j + 1, toks.length);
    let start = 0;
    if (name === 'array' || name === 'alignat' || name === 'subarray') { // skip the column spec {ccc}
      if (body[0] && body[0].k === 'lb') { let d = 0, q = 0; for (; q < body.length; q++) { if (body[q].k === 'lb') d++; else if (body[q].k === 'rb') { d--; if (d === 0) break; } } start = q + 1; }
    }
    const rows = [[[]]]; let d = 0, env = 0;
    for (let q = start; q < body.length; q++) {
      const t = body[q];
      if (t.k === 'lb') d++; else if (t.k === 'rb') d--;
      else if (isCmd(t, 'begin')) env++; else if (isCmd(t, 'end')) env--;
      if (d === 0 && env === 0) {
        if (t.k === 'amp') { rows[rows.length - 1].push([]); continue; }
        if (isCmd(t, '\\') || isCmd(t, 'cr')) { rows.push([[]]); continue; }
      }
      const cells = rows[rows.length - 1]; cells[cells.length - 1].push(t);
    }
    const parsed = rows.map(r => r.map(cell => parseMath(cell))).filter(r => r.some(c => c.length));
    return { t: 'env', name: name.replace('*', ''), rows: parsed };
  }

  function parseAtom() {
    const t = toks[p];
    if (!t) return null;
    switch (t.k) {
      case 'lb': return parseGroup();
      case 'rb': p++; return null;
      case 'num': p++; return { t: 'num', v: t.v };
      case 'sym': p++; return { t: 'sym', v: t.v };
      case 'text': p++; return { t: 'text', v: t.v };
      case 'opname': { p++; const w = t.v.replace(/[^A-Za-z]/g, ''); return BIG[w] && /^(argmax|argmin|max|min|sup|inf|lim|limsup|liminf)$/.test(w) ? { t: 'big', name: w } : { t: 'word', v: w }; }
      case 'amp': p++; return { t: 'ch', v: ',' };
      case 'prime': p++; return { t: 'word', v: 'prime' };
      case 'sup': case 'sub': p++; return parseArg(true);
      case 'ch': return parseChar(t);
      case 'cmd': return parseCommand(t);
    }
    p++; return null;
  }
  function parseChar(t) {
    const v = t.v;
    if (v === '(') { p++; const items = parseUntil(x => isCh(x, ')')); let close = ''; if (p < toks.length) { close = ')'; p++; } return { t: 'delim', kind: 'paren', open: '(', close, items }; }
    if (v === '[') { p++; const items = parseUntil(x => isCh(x, ']') || isCh(x, ')')); let close = ''; if (p < toks.length) { close = toks[p].v; p++; } return { t: 'delim', kind: 'brack', open: '[', close, items }; }
    if (v === ')' || v === ']') { p++; return null; }
    if (v === '|') {
      if (hasClosing(p + 1, isBar)) { p++; const items = parseUntil(isBar); p++; return { t: 'delim', kind: 'abs', items }; }
      p++; return { t: 'bar' };
    }
    p++; return { t: 'ch', v };
  }
  function parseCommand(t) {
    const n = t.n;
    if (n === 'left') {
      p++; const open = toks[p]; p++;
      const items = parseUntil(x => isCmd(x, 'right'));
      let close = null; if (p < toks.length) { p++; close = toks[p]; p++; }
      let kind = delimKind(open); const ck = delimKind(close);
      if (kind === 'none' && ck !== 'none') kind = ck === 'abs' || ck === 'norm' ? 'eval' : ck;
      if (kind === 'none' && !(open && open.k === 'ch' && open.v === '.')) kind = 'paren';
      return { t: 'delim', kind, open: open && (open.v || open.n), close: close && (close.v || close.n), items };
    }
    if (n === 'right') { p += 2; return null; }
    if (OPEN_CMD[n]) {
      p++; const kind = OPEN_CMD[n];
      const items = parseUntil(x => x.k === 'cmd' && CLOSE_CMD[x.n] === kind);
      if (p < toks.length) p++;
      return { t: 'delim', kind, items };
    }
    if (CLOSE_CMD[n]) { p++; return null; }
    if (n === '|' || n === 'Vert') {
      if (hasClosing(p + 1, isNormBar)) { p++; const items = parseUntil(isNormBar); p++; return { t: 'delim', kind: 'norm', items }; }
      p++; return { t: 'bar' };
    }
    if (n === 'vert') { p++; return { t: 'bar' }; }
    if (n === 'arg' && toks[p + 1] && toks[p + 1].k === 'cmd' && (toks[p + 1].n === 'max' || toks[p + 1].n === 'min')) { const m = toks[p + 1].n; p += 2; return { t: 'big', name: m === 'max' ? 'argmax' : 'argmin' }; }
    if (n === 'begin') { p++; return parseEnv(t.env); }
    if (n === 'end') { p++; return null; }
    p++;
    switch (n) {
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': return { t: 'frac', num: parseArg(), den: parseArg() };
      case 'binom': case 'dbinom': case 'tbinom': return { t: 'binom', a: parseArg(), b: parseArg() };
      case 'sqrt': {
        let idx = null;
        if (isCh(toks[p], '[')) { p++; idx = parseUntil(x => isCh(x, ']')); p++; }
        return { t: 'sqrt', idx, arg: parseArg() };
      }
      case 'pmod': return { t: 'pmod', arg: parseArg() };
      case 'substack': return { t: 'substack', arg: parseArg() };
      case 'underbrace': case 'overbrace': case 'underline': case 'overbracket': case 'underbracket': return { t: 'brace', arg: parseArg() };
      case 'overset': case 'underset': case 'stackrel': { parseArg(); return { t: 'brace', arg: parseArg() }; }
      case 'textcolor': parseArg(); return parseArg();
      case 'xrightarrow': case 'xleftarrow': { const a = parseArg(); return { t: 'xarrow', arg: a, dir: n }; }
      case 'bmod': case 'mod': return { t: 'word', v: 'mod' };
    }
    if (ARG_IGNORE.has(n)) { parseArg(); return null; }
    if (ACCENT[n] || n === 'vec') return { t: 'acc', name: n, arg: parseArg() };
    if (n === 'mathbb') return { t: 'bb', arg: parseArg() };
    if (STYLE_WORD.has(n)) return { t: 'styleword', arg: parseArg() };
    if (STYLE_SCRIPT.has(n)) return { t: 'scriptletter', arg: parseArg() };
    if (n === 'mathfrak') return { t: 'frakletter', arg: parseArg() };
    if (STYLE_PLAIN.has(n)) return parseArg();
    if (BIG[n]) return { t: 'big', name: n };
    if (FUNCS[n]) return { t: 'func', name: n };
    if (SPACES.has(n)) return null;
    return { t: 'cmd', name: n };
  }
  return parseUntil(() => false);
}

/* ---- 3. speak ---- */
const isRelItem = it => !!it && ((it.t === 'ch' && '=<>:'.includes(it.v)) || (it.t === 'cmd' && RELS[it.name] !== undefined));
const isOpItem = it => !!it && ((it.t === 'ch' && '+-*/'.includes(it.v)) || (it.t === 'cmd' && OPS[it.name] !== undefined));
const isSepItem = it => !!it && it.t === 'ch' && (it.v === ',' || it.v === ';');
const SIMPLE_T = new Set(['num', 'sym', 'word', 'text', 'bar']);
function isAtomic(it) {
  if (!it) return false;
  if (SIMPLE_T.has(it.t)) return true;
  if (it.t === 'cmd' && (GREEK[it.name] || SYMS[it.name] !== undefined)) return true;
  if (it.t === 'scr') return !it.sup && !it.primes && isAtomic(it.base) && (!it.sub || isSimpleItems(argItems(it.sub)));
  if (it.t === 'acc' || it.t === 'bb' || it.t === 'scriptletter' || it.t === 'styleword') return true;
  if (it.t === 'group') return isSimpleItems(it.items);
  return false;
}
function isSimpleItems(items) { const xs = items.filter(Boolean); return xs.length <= 2 && xs.every(isAtomic) && !(xs.length === 2 && xs[0].t === 'num' && xs[1].t === 'num'); }
function argItems(a) { return a && a.t === 'group' ? a.items : a ? [a] : []; }
function hasOperator(items) { return items.some(x => isOpItem(x) || isRelItem(x) || x.t === 'frac' || (x.t === 'group' && hasOperator(x.items)) || (x.t === 'delim' && hasOperator(x.items))); }
const letterWord = v => (v === 'a' ? 'ay' : v);
const wordOf = items => { const xs = items.filter(Boolean); return xs.length > 1 && xs.every(x => x.t === 'sym') ? xs.map(x => x.v).join('') : null; };

function speakMath(items, ctx) {
  ctx = ctx || {};
  const out = [];
  let quant = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.t === 'cmd' && (it.name === 'forall' || it.name === 'exists')) quant = true;
    const c2 = quant && it.t === 'ch' && it.v === ':' ? Object.assign({}, ctx, { inSet: true }) : ctx; // "there exists d > 0 : ..."
    const s = speakItem(it, items[i - 1], items[i + 1], c2, i < items.length - 1 || !!ctx.more, i);
    if (s) out.push(s);
  }
  return out.join(' ');
}
// does anything that needs an "end of ..." marker follow? (not needed before a comma, a relation, or the end of the formula)
function markerNeeded(next, more) { if (next) return !(isSepItem(next) || isRelItem(next)); return !!more; }
const endWord = (text, next, more, word) => (markerNeeded(next, more) ? text + ', end ' + word : text);

function speakItem(it, prev, next, ctx, more) {
  switch (it.t) {
    case 'num': return it.v;
    case 'sym': return letterWord(it.v);
    case 'word': return it.v;
    case 'text': return it.v.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, ' ').replace(/\s+/g, ' ').trim();
    case 'bar': return ctx.inSet ? 'such that' : ctx.inApp ? 'given' : 'bar';
    case 'ch': return speakChar(it, prev, ctx);
    case 'cmd': return speakCommand(it.name, ctx);
    case 'func': return FUNCS[it.name] || it.name;
    case 'big': return BIG[it.name];
    case 'group': return speakMath(it.items, Object.assign({}, ctx, { more }));
    case 'frac': return speakFrac(it, next, ctx, more);
    case 'binom': return speakMath(argItems(it.a), { more: true }) + ' choose ' + speakMath(argItems(it.b), { more: true });
    case 'sqrt': {
      const arg = speakMath(argItems(it.arg), { more: false });
      let w = 'square root of';
      if (it.idx) { const x = speakMath(it.idx, {}); w = x === '3' ? 'cube root of' : x === '4' ? 'fourth root of' : x + 'th root of'; }
      const simple = isSimpleItems(argItems(it.arg));
      return simple ? w + ' ' + arg : endWord(w + ' ' + arg, next, more, 'root');
    }
    case 'acc': {
      const inner = speakMath(argItems(it.arg), { more: true });
      return it.name === 'vec' ? 'vector ' + inner : inner + ' ' + ACCENT[it.name];
    }
    case 'bb': { const k = argItems(it.arg).map(x => x.v).join(''); return BLACKBOARD[k] || 'blackboard ' + speakMath(argItems(it.arg), {}); }
    case 'scriptletter': return 'script ' + speakMath(argItems(it.arg), {});
    case 'frakletter': return 'fraktur ' + speakMath(argItems(it.arg), {});
    case 'styleword': { const a = argItems(it.arg); return wordOf(a) || speakMath(a, {}); }
    case 'pmod': return 'mod ' + speakMath(argItems(it.arg), {});
    case 'substack': return speakRows(argItems(it.arg), ' and ');
    case 'brace': return speakMath(argItems(it.arg), Object.assign({}, ctx, { more }));
    case 'xarrow': return 'goes to, by ' + speakMath(argItems(it.arg), {}) + ',';
    case 'delim': return speakDelim(it, prev, next, ctx, more);
    case 'scr': return speakScripted(it, prev, next, ctx, more);
    case 'env': return speakEnv(it, ctx, prev);
  }
  return '';
}
function speakRows(items, joiner) { // items separated by \\ commands
  const rows = [[]]; for (const x of items) { if (x.t === 'cmd' && x.name === '\\') rows.push([]); else rows[rows.length - 1].push(x); }
  return rows.filter(r => r.length).map(r => speakMath(r, { more: true })).join(joiner);
}
const unary = prev => !prev || isRelItem(prev) || isOpItem(prev) || isSepItem(prev) || prev.t === 'big' || (prev.t === 'ch' && '([{'.includes(prev.v));
function speakChar(it, prev, ctx) {
  switch (it.v) {
    case '=': return 'equals';
    case '+': return 'plus';
    case '-': case '−': return unary(prev) ? 'negative' : 'minus';
    case '<': return 'is less than';
    case '>': return 'is greater than';
    case '/': return 'over';
    case '*': return 'star';
    case '!': return 'factorial';
    case ':': return ctx.inSet ? 'such that' : 'colon';
    case ',': return ',';
    case ';': return ';';
    case '±': return 'plus or minus';
    case '≤': return 'is less than or equal to';
    case '≥': return 'is greater than or equal to';
    case '×': return 'times';
    case '·': return 'dot';
  }
  return '';
}
function speakCommand(name, ctx) {
  if (GREEK[name]) return GREEK[name];
  if (name === 'mid') return ctx.inSet ? 'such that' : ctx.inApp ? 'given' : 'divides';
  if (name === 'colon') return 'colon';
  if (name === 'times' && ctx.dims) return 'by';
  if (name === 'to' || name === 'rightarrow') return ctx.arrowTo ? 'to' : 'goes to';
  if (RELS[name] !== undefined) return RELS[name];
  if (OPS[name] !== undefined) return OPS[name];
  if (SYMS[name] !== undefined) return SYMS[name];
  return name.length > 1 ? name : '';
}
function isSmallInt(items, max) { const xs = items.filter(Boolean); return xs.length === 1 && xs[0].t === 'num' && /^\d+$/.test(xs[0].v) && +xs[0].v <= max; }
function startsWithD(items) { // dy, d^2y, \partial f ... : the numerator or denominator of a derivative
  const x = items.filter(Boolean)[0]; if (!x) return false;
  const b = x.t === 'scr' ? x.base : x;
  return (b.t === 'sym' && b.v === 'd') || (b.t === 'cmd' && b.name === 'partial') || (b.t === 'styleword' && wordOf(argItems(b.arg)) === null && argItems(b.arg).length === 1 && argItems(b.arg)[0].v === 'd');
}
function speakFrac(it, next, ctx, more) {
  const n = argItems(it.num).filter(Boolean), d = argItems(it.den).filter(Boolean);
  if (isSmallInt(n, 99) && isSmallInt(d, 10) && FRACW[+d[0].v]) {
    const k = +n[0].v, w = FRACW[+d[0].v];
    return k === 1 ? 'one ' + w : k + ' ' + (w === 'half' ? 'halves' : w + 's');
  }
  const ns = speakMath(n, { more: true }), ds = speakMath(d, { more });
  if (startsWithD(n) && startsWithD(d)) return ns + ' by ' + ds;
  if (isSimpleItems(n) && isSimpleItems(d)) return ns + ' over ' + ds;
  return endWord('the fraction ' + ns + ' over ' + ds, next, more, 'fraction');
}
function speakScripted(it, prev, next, ctx, more) {
  const base = it.base;
  if (base.t === 'brace') return speakMath(argItems(base.arg), Object.assign({}, ctx, { more }));
  if (base.t === 'big') return speakBig(it, next, ctx);
  if (base.t === 'delim' && base.kind === 'eval') return speakDelim(base, prev, next, ctx, more, it.sub);
  if (base.t === 'delim' && base.kind === 'norm' && it.sub && !it.sup && !it.primes) { const w = speakMath(argItems(it.sub).filter(Boolean), {}); return 'the ' + (w === 'infinity' ? 'infinity' : w) + ' norm of ' + speakMath(base.items, { more: true }); }
  const sup = it.sup ? argItems(it.sup).filter(Boolean) : null, sub = it.sub ? argItems(it.sub).filter(Boolean) : null;
  if (base.t === 'bb' && sup && !sub && !it.primes) { // R^n, R^{n x m}: "R n", "R n by m"
    const k = argItems(base.arg).map(x => x.v).join('');
    if (/^[RNZQC]$/.test(k)) return k + ' ' + speakMath(sup, { dims: true, more: true });
  }
  let s = base.t === 'delim' ? speakDelim(base, prev, null, ctx, true, null, true) : speakItem(base, prev, null, ctx, true);
  if (base.t === 'delim' && /^the quantity/.test(s)) s += ',';
  const isFunc = base.t === 'func';
  if (it.primes) s += ' ' + (it.primes === 1 ? 'prime' : it.primes === 2 ? 'double prime' : it.primes === 3 ? 'triple prime' : it.primes + ' prime');
  if (sub) {
    const w = speakMath(sub, { more: true });
    if (isFunc && (base.name === 'log') && sub.length) s += ' base ' + w;
    else s += ' sub ' + w + (isSimpleItems(sub) ? '' : (sup || markerNeeded(next, more) ? ', end sub' : ''));
  }
  if (sup) {
    const raw = sup.length === 1 ? sup[0] : null;
    const v = raw && (raw.t === 'num' ? raw.v : raw.t === 'sym' ? raw.v : raw.t === 'cmd' ? raw.name : raw.t === 'delim' && raw.kind === 'paren' && raw.items.length === 1 && raw.items[0].t === 'sym' ? '(' + raw.items[0].v + ')' : null);
    const neg1 = sup.length === 2 && sup[0].t === 'ch' && sup[0].v === '-' && sup[1].t === 'num' && sup[1].v === '1';
    if (raw && v === '2') s += ' squared';
    else if (raw && v === '3') s += ' cubed';
    else if (raw && /^\d+$/.test(v) && ORD[+v]) s += ' to the ' + ORD[+v];
    else if (raw && (v === 'prime')) s += ' prime';
    else if (raw && v === 'circ') s += ' degrees';
    else if (raw && (v === 'top' || v === 'T' || v === 'intercal')) s += ' transpose';
    else if (raw && (v === 'ast' || v === '*')) s += ' star';
    else if (raw && v === 'dagger') s += ' dagger';
    else if (raw && /^\(.\)$/.test(v)) s += ' superscript ' + v[1];
    else if (neg1) s += ' inverse';
    else if (isSimpleItems(sup)) { s += ' to the ' + speakMath(sup, { more: true }); if (next && !isOpItem(next) && !isRelItem(next) && !isSepItem(next)) s += ','; }
    else s += ' to the power of ' + speakMath(sup, { more: true }) + (markerNeeded(next, more) ? ', end power' : '');
    if (neg1 && isFunc) s = 'inverse ' + s.replace(/ inverse$/, '');
  }
  return s;
}
function speakBig(it, next, ctx) {
  const name = it.base.name, lo = it.sub ? argItems(it.sub).filter(Boolean) : null, hi = it.sup ? argItems(it.sup).filter(Boolean) : null;
  let t = BIG[name];
  const L = lo && speakMath(lo, { more: true }), H = hi && speakMath(hi, { more: true });
  if (BIG_LIM.has(name)) { if (L) t += ' as ' + L; }
  else if (BIG_SUM.has(name) || BIG_INT.has(name)) {
    if (L && H) t += ' from ' + L + ' to ' + H;
    else if (H) t += ' to ' + H;
    else if (L) t += (lo.some(x => x.t === 'ch' && x.v === '=') ? ' from ' : ' over ') + L;
  } else if (L) t += ' over ' + L;
  return t + (L || H || BIG_SUM.has(name) || BIG_INT.has(name) ? ' of' : '');
}
function isApplicable(prev, ctx) { // can a following (...) be the argument of prev?  f(x), sin(x), E[X], Var(X)
  if (!prev) return null;
  if (prev.t === 'func') return prev.name;
  if (prev.t === 'big' && (prev.name === 'max' || prev.name === 'min' || prev.name === 'sup' || prev.name === 'inf' || prev.name === 'argmax' || prev.name === 'argmin')) return 'fn';
  if (prev.t === 'word') return prev.v;
  if (prev.t === 'styleword') return wordOf(argItems(prev.arg)) || 'fn';
  if (prev.t === 'bb') return 'stat';
  if (prev.t === 'scriptletter') return 'fn';
  if (prev.t === 'frac' && startsWithD(argItems(prev.num).filter(Boolean)) && startsWithD(argItems(prev.den).filter(Boolean))) return 'fn';
  if (prev.t === 'sym') return FN_LETTERS.test(prev.v) ? prev.v : 'maybe';
  if (prev.t === 'scr') { const b = prev.base; if (b.t === 'sym' || b.t === 'func' || b.t === 'word') return (b.t === 'sym' && !FN_LETTERS.test(b.v)) ? 'maybe' : 'fn'; if (b.t === 'big' && !prev.sub && !prev.sup) return 'fn'; }
  if (prev.t === 'cmd' && GREEK[prev.name]) return /^(phi|psi|varphi|rho|mu|sigma|lambda|theta|chi)$/.test(prev.name) ? 'maybe' : null;
  return null;
}
function speakDelim(it, prev, next, ctx, more, evalSub, asBase) {
  const items = it.items, k = it.kind;
  const inner = (extra) => speakMath(items, Object.assign({}, ctx, extra, { more: true }));
  const simple = isSimpleItems(items.filter(x => !isSepItem(x)));
  switch (k) {
    case 'abs': return simple ? 'absolute value of ' + inner() : endWord('the absolute value of ' + inner(), next, more, 'absolute value');
    case 'norm': return simple ? 'the norm of ' + inner() : endWord('the norm of ' + inner(), next, more, 'norm');
    case 'floor': return simple ? 'floor of ' + inner() : endWord('the floor of ' + inner(), next, more, 'floor');
    case 'ceil': return simple ? 'ceiling of ' + inner() : endWord('the ceiling of ' + inner(), next, more, 'ceiling');
    case 'angle': {
      const parts = splitTop(items);
      if (parts.length === 2) return 'the inner product of ' + speakMath(parts[0], { more: true }) + ' and ' + speakMath(parts[1], { more: true });
      return endWord('angle bracket ' + inner(), next, more, 'angle bracket');
    }
    case 'set': {
      if (!items.length) return 'the empty set';
      const bi = items.findIndex(x => x.t === 'bar' || (x.t === 'cmd' && x.name === 'mid') || (x.t === 'ch' && x.v === ':'));
      if (bi > 0) return endWord('the set of ' + speakMath(items.slice(0, bi), { more: true }) + ' such that ' + speakMath(items.slice(bi + 1), Object.assign({}, ctx, { inSet: true, more: true })), next, more, 'set');
      return endWord('the set containing ' + inner({ inSet: true }), next, more, 'set');
    }
    case 'eval': {
      const at = evalSub ? speakMath(argItems(evalSub), { more: true }) : '';
      return inner() + (at ? ', evaluated at ' + at : '');
    }
    case 'paren': case 'brack': {
      const app = isApplicable(prev, ctx);
      const parts = splitTop(items);
      if (app && (prev.t !== 'sym' || app !== 'maybe' || (isSimpleItems(items.filter(x => !isSepItem(x))) && !hasOperator(items)))) {
        const c2 = Object.assign({}, ctx, { inApp: true, more: true });
        const joiner = /^(max|min|gcd|lcm|Cov|covariance|sup|inf|fn)$/.test(String(app)) && parts.length === 2 ? ' and ' : null;
        const body = joiner ? parts.map(pt => speakMath(pt, c2)).join(joiner) : speakMath(items, c2);
        return 'of ' + body;
      }
      if (k === 'brack' && parts.length === 2 && (it.close === ']' || it.close === ')') && (prev && prev.t === 'cmd' && prev.name === 'in')) {
        const a = speakMath(parts[0], { more: true }), b = speakMath(parts[1], { more: true });
        return (it.close === ']' ? 'the closed interval from ' : 'the interval from ') + a + ' to ' + b + (it.close === ')' ? ', not including ' + b : '');
      }
      if (k === 'paren' && parts.length === 2 && prev && prev.t === 'cmd' && prev.name === 'in') return 'the open interval from ' + speakMath(parts[0], { more: true }) + ' to ' + speakMath(parts[1], { more: true });
      // plain grouping: "the quantity ..." only when it matters (it multiplies, is a base of a power, or is multiplied)
      const factorPrev = prev && !isOpItem(prev) && !isRelItem(prev) && !isSepItem(prev) && prev.t !== 'big' && prev.t !== 'func';
      const factorNext = next && !isOpItem(next) && !isRelItem(next) && !isSepItem(next);
      const postfix = next && next.t === 'ch' && next.v === '!';
      if ((hasOperator(items) && (asBase || postfix || factorPrev || factorNext)) || ((asBase || postfix) && !isSimpleItems(items))) {
        const q = (factorPrev ? 'times ' : '') + 'the quantity ' + inner();
        return asBase ? q : postfix ? q + ',' : endWord(q, next, more, 'quantity');
      }
      return inner();
    }
  }
  return inner();
}
function splitTop(items) { const parts = [[]]; for (const x of items) { if (isSepItem(x) && x.v === ',') parts.push([]); else parts[parts.length - 1].push(x); } return parts.filter(p => p.length); }
function speakEnv(it, ctx, prev) {
  const cell = c => speakMath(c, { more: true });
  const rows = it.rows, nr = rows.length, nc = Math.max.apply(null, rows.map(r => r.length).concat([0]));
  if (MATRIX.has(it.name)) {
    const lead = it.name === 'vmatrix' ? (prev && prev.t === 'func' && prev.name === 'det' ? 'of ' : 'the determinant of ') : it.name === 'Vmatrix' ? 'the norm of ' : '';
    if (nc === 1) return lead + 'the column vector ' + rows.map(r => cell(r[0])).join(', ');
    if (nr === 1) return lead + 'the row vector ' + rows[0].map(cell).join(', ');
    return lead + 'the ' + nr + ' by ' + nc + ' matrix with rows: ' + rows.map((r, i) => 'row ' + (i + 1) + ': ' + r.map(cell).join(', ')).join('; ') + '; end matrix';
  }
  if (it.name === 'cases') return 'cases: ' + rows.map((r, i) => 'case ' + (i + 1) + ': ' + r.map(cell).join(', ')).join('; ') + '; end cases';
  return rows.map(r => r.map(cell).join(' ')).join('. ');
}

function clean(s) {
  return s.replace(/\s+/g, ' ').replace(/,\s*\./g, '.').replace(/\s+([,.;:])/g, '$1').replace(/([,;])(\s*[,;])+/g, '$1').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
}
function texToSpeech(src) {
  try {
    const items = parseMath(lexMath(src));
    // "f : X \to Y" reads "f colon X to Y", but "x \to 0" (a limit) reads "x goes to 0"
    const ci = items.findIndex(x => x.t === 'ch' && x.v === ':' || x.t === 'cmd' && x.name === 'colon');
    const arrowTo = ci >= 0 && items.slice(ci).some(x => x.t === 'cmd' && (x.name === 'to' || x.name === 'rightarrow'));
    return clean(speakMath(items, { arrowTo }));
  } catch (e) {
    return clean(src.replace(/\\[a-zA-Z]+/g, ' ').replace(/[^A-Za-z0-9+=<>.,;:!? ]/g, ' '));
  }
}

/* ---------- code -> speech ---------- */

const LANGS = { py: 'Python', python: 'Python', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
  sh: 'shell', bash: 'shell', zsh: 'shell', shell: 'shell', c: 'C', cpp: 'C plus plus', 'c++': 'C plus plus', cs: 'C sharp', 'c#': 'C sharp', java: 'Java', go: 'Go',
  rs: 'Rust', rust: 'Rust', rb: 'Ruby', ruby: 'Ruby', php: 'PHP', sql: 'SQL', r: 'R', json: 'JSON', yaml: 'YAML', yml: 'YAML', html: 'HTML', css: 'CSS',
  xml: 'XML', kt: 'Kotlin', kotlin: 'Kotlin', swift: 'Swift', lua: 'Lua', julia: 'Julia', jl: 'Julia', matlab: 'MATLAB', tex: 'LaTeX', latex: 'LaTeX', md: 'Markdown', toml: 'TOML' };
const CODE_OPS = [['===', 'is strictly equal to'], ['!==', 'is not strictly equal to'], ['...', 'dot dot dot'], ['<<=', 'shift left equals'], ['>>=', 'shift right equals'], ['**=', 'power equals'],
  ['==', 'is equal to'], ['!=', 'is not equal to'], ['<=', 'is less than or equal to'], ['>=', 'is greater than or equal to'], ['&&', 'and'], ['||', 'or'], ['++', 'plus plus'],
  ['--', 'minus minus'], ['+=', 'plus equals'], ['-=', 'minus equals'], ['*=', 'times equals'], ['/=', 'divided by equals'], ['%=', 'mod equals'], ['|=', 'or equals'],
  ['&=', 'and equals'], ['^=', 'xor equals'], ['=>', 'arrow'], ['->', 'arrow'], ['<-', 'left arrow'], ['::', 'double colon'], ['<<', 'shift left'], ['>>', 'shift right'],
  ['**', 'to the power of'], ['??', 'or if null'], ['?.', 'optional'], [':=', 'assign']];
const CODE_SYMS = { '=': 'equals', '+': 'plus', '-': 'minus', '*': 'times', '/': 'slash', '%': 'percent', '<': 'is less than', '>': 'is greater than', '!': 'not',
  '?': 'question mark', ':': 'colon', ';': 'semicolon', '.': 'dot', ',': ',', '(': 'open paren', ')': 'close paren', '[': 'open bracket', ']': 'close bracket',
  '{': 'open brace', '}': 'close brace', '&': 'ampersand', '|': 'pipe', '^': 'caret', '~': 'tilde', '$': 'dollar', '@': 'at', '#': 'hash', '\\': 'backslash' };

const codeWords = s => s.replace(/_+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
const codePlain = s => s.replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim();

// one line of code -> something worth saying. '' means "say nothing" (blank, or only closing brackets).
function codeToSpeech(src) {
  const t = src.replace(/\t/g, '  ').trim();
  if (!t || /^[})\];,\s]*$/.test(t)) return '';
  const out = [], n = t.length;
  let i = 0;
  while (i < n) {
    const c = t[i], rest = t.slice(i);
    if (c === ' ') { i++; continue; }
    if (rest.startsWith('//') && t[i - 1] !== ':') { out.push('comment, ' + codePlain(rest.slice(2))); break; }
    if (c === '#' && (i === 0 || t[i - 1] === ' ') && !/^#(include|define|if|ifdef|ifndef|endif|else|elif|pragma|import|!)/.test(rest)) { out.push('comment, ' + codePlain(rest.slice(1))); break; }
    if (i === 0 && /^--(\s|$)/.test(rest)) { out.push('comment, ' + codePlain(rest.slice(2))); break; }
    if (rest.startsWith('/*')) { const e = t.indexOf('*/', i + 2); out.push('comment, ' + codePlain(t.slice(i + 2, e < 0 ? n : e))); i = e < 0 ? n : e + 2; continue; }
    if (i === 0 && /^\*+\/?(\s|$)/.test(rest)) { out.push(codePlain(rest)); break; } // continuation of a block comment
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < n && (t[j] !== c || t[j - 1] === '\\')) j++;
      out.push('quote ' + codePlain(t.slice(i + 1, j)) + ' end quote'); i = j + 1; continue;
    }
    let m = /^(0x[0-9a-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (m) { out.push(m[1].replace(/_/g, '')); i += m[1].length; continue; }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (m) { out.push(codeWords(m[0])); i += m[0].length; continue; }
    const op = CODE_OPS.find(o => rest.startsWith(o[0]));
    if (op) { out.push(op[1]); i += op[0].length; continue; }
    if (c === ';' && !t.slice(i + 1).trim()) { i++; continue; } // a semicolon ending the line is just punctuation
    if (c === '/' && /\w/.test(t[i - 1] || '') && /\w/.test(t[i + 1] || '')) { out.push('slash'); i++; continue; }
    out.push(CODE_SYMS[c] || ''); i++;
  }
  return out.join(' ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s+/g, ' ').trim();
}

/* ---------- LaTeX source -> Markdown ---------- */

// text of a {...} group starting at s[i] === '{' -> [inner, indexAfter], or null if unbalanced
function readBraced(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return [s.slice(i + 1, j), j + 1]; }
  }
  return null;
}

// \newcommand, \renewcommand, \def and \DeclareMathOperator: remove the definitions and expand every use
function expandMacros(t) {
  const defs = {};
  const patterns = [
    [/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?\s*(?:\[(\d)\])?\s*(?:\[[^\]]*\])?\s*(?=\{)/g, 'new'],
    [/\\providecommand\*?\s*\{?\\([A-Za-z]+)\}?\s*(?:\[(\d)\])?\s*(?=\{)/g, 'new'],
    [/\\def\s*\\([A-Za-z]+)\s*((?:#\d)*)\s*(?=\{)/g, 'def'],
    [/\\DeclareMathOperator\*?\s*\{\\([A-Za-z]+)\}\s*(?=\{)/g, 'op']
  ];
  for (const [re, kind] of patterns) {
    let out = '', last = 0, m;
    while ((m = re.exec(t))) {
      const b = readBraced(t, re.lastIndex); if (!b) continue;
      const n = kind === 'def' ? (m[2] || '').length / 2 : kind === 'op' ? 0 : (+m[2] || 0);
      defs[m[1]] = { n, body: kind === 'op' ? '\\operatorname{' + b[0].replace(/\\[,;: !]|\s+/g, '') + '}' : b[0] };
      out += t.slice(last, m.index); last = b[1]; re.lastIndex = b[1];
    }
    t = out + t.slice(last);
  }
  const names = Object.keys(defs).sort((x, y) => y.length - x.length);
  if (!names.length) return t;
  const nameRe = new RegExp('\\\\(' + names.join('|') + ')(?![A-Za-z])', 'g');
  for (let pass = 0; pass < 4; pass++) { // macros may use other macros
    let out = '', last = 0, changed = false, m;
    nameRe.lastIndex = 0;
    while ((m = nameRe.exec(t))) {
      const d = defs[m[1]]; let j = m.index + m[0].length; const args = [];
      for (let k = 0; k < d.n; k++) {
        while (j < t.length && /\s/.test(t[j])) j++;
        if (t[j] === '{') { const g = readBraced(t, j); if (!g) break; args.push(g[0]); j = g[1]; } else { args.push(t[j] || ''); j++; }
      }
      if (args.length < d.n) continue;
      out += t.slice(last, m.index) + d.body.replace(/#(\d)/g, (_, k) => (args[+k - 1] != null ? args[+k - 1] : ''));
      last = j; nameRe.lastIndex = j; changed = true;
      if (out.length > 5e7) break;
    }
    t = out + t.slice(last);
    if (!changed) break;
  }
  return t;
}

// replace \cmd{...}...: f(inner) for every \cmd{ with balanced braces (inner may contain braces)
function mapBraced(t, cmd, f, nargs) {
  const re = new RegExp('\\\\' + cmd + '\\*?(?:\\[[^\\]]*\\])?(?=\\s*\\{)', 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(t))) {
    let j = m.index + m[0].length; const args = [];
    for (let k = 0; k < (nargs || 1); k++) { while (j < t.length && /\s/.test(t[j])) j++; const g = t[j] === '{' ? readBraced(t, j) : null; if (!g) break; args.push(g[0]); j = g[1]; }
    if (args.length < (nargs || 1)) continue;
    out += t.slice(last, m.index) + f.apply(null, args); last = j; re.lastIndex = j;
  }
  return out + t.slice(last);
}

function texToMd(src) {
  let t = src.replace(/\r\n?/g, '\n');
  // verbatim/listings first: their % and \ are code, not LaTeX
  const stash = [];
  t = t.replace(/\\begin\{(verbatim\*?|lstlisting|minted)\}(?:\[[^\]]*\])?(?:\{[^}\n]*\})?\n?([\s\S]*?)\\end\{\1\}/g, (m, k, body) => { stash.push('\n\n```\n' + body.replace(/\n+$/, '') + '\n```\n\n'); return '\n\u0002' + (stash.length - 1) + '\u0002\n'; });
  t = t.replace(/\\verb(.)(.*?)\1/g, (m, d, body) => { stash.push('`' + body + '`'); return '\u0002' + (stash.length - 1) + '\u0002'; });
  t = t.replace(/(^|[^\\])%.*$/gm, '$1');
  t = expandMacros(t);
  const title = /\\title\{([^{}]*)\}/.exec(t);
  const doc = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(t);
  if (doc) t = doc[1];
  // keep equations untouched by the prose clean-up below (e.g. \\ is a row break in math but a line break in text)
  const maths = [];
  t = t.replace(MATH_RE, m => { maths.push(m); return '\u0003' + (maths.length - 1) + '\u0003'; });
  t = t.replace(/\\(maketitle|tableofcontents|listoffigures|listoftables|newpage|clearpage|pagebreak|centering|noindent|bigskip|medskip|smallskip|appendix|bibliographystyle\{[^}]*\}|bibliography\{[^}]*\}|printbibliography)\b/g, '');
  t = t.replace(/\\(newtheorem|theoremstyle|usepackage|setlength|pagestyle|geometry)\*?(\[[^\]]*\])?\{[^{}]*\}(\{[^{}]*\})?(\[[^\]]*\])?/g, '');
  t = t.replace(/\\begin\{abstract\}/g, '\n\n**Abstract.** ').replace(/\\end\{abstract\}/g, '\n\n');
  const head = { chapter: '#', section: '##', subsection: '###', subsubsection: '####' };
  t = t.replace(/\\(chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, k, x) => '\n\n' + head[k] + ' ' + x.replace(/\s+/g, ' ') + '\n\n');
  t = t.replace(/\\(paragraph|subparagraph)\*?\{([^{}]*)\}/g, '\n\n**$2** ');
  // figures and tables: keep the caption, drop the picture
  t = t.replace(/\\begin\{(figure|table)\*?\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{\1\*?\}/g, (m, kind, body) => {
    let cap = ''; mapBraced(body, 'caption', x => { cap = x; return ''; });
    return cap ? '\n\n*' + (kind === 'figure' ? 'Figure' : 'Table') + '.* ' + cap.replace(/\s+/g, ' ') + '\n\n' : '\n\n';
  });
  t = t.replace(/\\begin\{tabular\*?\}[\s\S]*?\\end\{tabular\*?\}/g, '\n\n').replace(/\\includegraphics(?:\[[^\]]*\])?\{[^{}]*\}/g, '');
  t = t.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (m, kind, body) =>
    '\n\n' + body.replace(/\\item\s*(\[([^\]]*)\])?/g, (mm, l, lab) => (kind === 'itemize' ? '\n- ' : '\n1. ') + (lab ? lab + ' ' : '')) + '\n\n');
  t = t.replace(/\\begin\{description\}([\s\S]*?)\\end\{description\}/g, (m, body) => '\n\n' + body.replace(/\\item\s*\[([^\]]*)\]/g, '\n- **$1** ') + '\n\n');
  t = t.replace(/\\begin\{(theorem|lemma|proposition|corollary|definition|proof|remark|example|claim|conjecture|notation|assumption|fact)\*?\}(\[([^\]]*)\])?/g,
    (m, k, o, nm) => '\n\n**' + k[0].toUpperCase() + k.slice(1) + (nm ? ' (' + nm + ')' : '') + '.** ');
  t = t.replace(/\\end\{(theorem|lemma|proposition|corollary|definition|proof|remark|example|claim|conjecture|notation|assumption|fact)\*?\}/g, '\n\n');
  // citations and references before footnotes (a footnote can contain a \cite)
  t = t.replace(/\\cite[a-z]*\*?(?:\[[^\]]*\])*\{[^{}]*\}/g, '[citation]').replace(/\\(?:eq|auto|c|C|page|v)?ref\*?\{[^{}]*\}/g, '(ref)').replace(/\\label\{[^{}]*\}/g, '');
  t = mapBraced(t, 'footnote', x => ' (' + x + ')');
  t = mapBraced(t, 'href', (u, x) => x, 2);
  t = mapBraced(t, 'url', x => x);
  for (let k = 0; k < 3; k++) {
    t = t.replace(/\\textbf\{([^{}]*)\}/g, '**$1**').replace(/\\(emph|textit|textsl)\{([^{}]*)\}/g, '*$2*')
      .replace(/\\texttt\{([^{}]*)\}/g, '`$1`').replace(/\\(textsc|textrm|textsf|textnormal|mbox|underline)\{([^{}]*)\}/g, '$2');
  }
  t = t.replace(/``/g, '“').replace(/''/g, '”').replace(/~/g, ' ').replace(/\\([%&#_])/g, '$1').replace(/\\(?:\\|newline)(\[[^\]]*\])?/g, '\n').replace(/\\ /g, ' ').replace(/\\par\b/g, '\n\n')
    .replace(/\\(hspace|vspace)\*?\{[^{}]*\}/g, '').replace(/\\(?:quad|qquad)\b/g, ' ').replace(/\\(ldots|dots)\b/g, '…');
  if (title) t = '# ' + title[1] + '\n\n' + t;
  t = t.replace(/[{}]/g, '');
  t = t.replace(/\u0003(\d+)\u0003/g, (m, i) => maths[+i]);
  t = t.replace(/\u0002(\d+)\u0002/g, (m, i) => stash[+i]);
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
      const closed = buf.length > 1 && buf[buf.length - 1].trim().startsWith(fence);
      const info = /^\s*(?:```|~~~)\s*([^\s`]*)/.exec(buf[0]);
      out.push({ t: 'code', lang: ((info && info[1]) || '').toLowerCase(), body: buf.slice(1, closed ? -1 : undefined), md: buf.join('\n') }); continue;
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
  const out = [], cnt = {}; let fence = null, pos = 0;
  for (const line of text.split('\n')) {
    const start = pos; pos += line.length + 1;
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) { fence = fence ? (f[1] === fence ? null : fence) : f[1]; continue; }
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const title = plainTitle(m[2]); if (!title || !/[A-Za-z0-9]/.test(title)) continue;
    cnt[title] = cnt[title] == null ? 0 : cnt[title] + 1;
    out.push({ level: m[1].length, title, n: cnt[title], offset: start });
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
    const spoken = env.readCode ? h.replace(/<code>([\s\S]*?)<\/code>/g, (m, x) => ' ' + (codeToSpeech(htmlToText(x)) || htmlToText(x)) + ' ') : h;
    const speak = clean(htmlToText(spoken).replace(TOK, (m, i) => ' ' + mathSpeech(+i) + ' '));
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
    } else if (b.t === 'code' && env.readCode) {
      const name = LANGS[b.lang] || (b.lang && /^[a-z0-9+#.-]+$/.test(b.lang) ? b.lang : '');
      units.push({ speak: 'Code block' + (name ? ' in ' + name : '') + '.' });
      let inner = '<div class="codehead s" data-i="' + (units.length - 1) + '">' + esc(name ? name + ' code' : 'code') + '</div><pre class="code"><code>';
      for (const line of b.body) {
        const sp = codeToSpeech(line);
        if (sp && /[A-Za-z0-9]/.test(sp)) { units.push({ speak: sp }); inner += '<span class="s codeline" data-i="' + (units.length - 1) + '">' + esc(line) + '</span>'; }
        else inner += '<span class="codeline">' + (esc(line) || ' ') + '</span>';
      }
      html += '<div class="codeblock">' + inner + '</code></pre></div>';
    } else html += '<div class="rawblock">' + parseBlock(b.md || '') + '</div>';
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

const api = { texToSpeech, texToMd, extractMath, splitSentences, parseBlocks, buildDocument, chunkForTTS, splitChunks, scanHeadings, plainTitle, codeToSpeech, esc };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BookCore = api;
})(typeof self !== 'undefined' ? self : this);
