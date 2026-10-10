const C = require('../core.js');
let fail = 0;
function eq(name, got, want) { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fail++; console.log('FAIL', name, '\n  got :', JSON.stringify(got), '\n  want:', JSON.stringify(want)); } else console.log('ok  ', name); }
const sp = C.texToSpeech;
// readings of the corpus (reviewed by hand once, now pinned)
const snap = require('./math.snap.json');
for (const k of Object.keys(snap)) eq('math: ' + k, sp(k), snap[k]);
// a few readings spelled out
eq('f(x) is "f of x"', sp('f(x) = x^2'), 'f of x equals x squared');
eq('conditional probability', sp('P(A \\mid B)'), 'P of A given B');
eq('set builder', sp('\\{ x : x > 0 \\}'), 'the set of x such that x is greater than 0');
eq('multiplied group', sp('2(x+1)'), '2 times the quantity x plus 1');
eq('half', sp('\\frac{1}{2} m v^2'), 'one half m v squared');
eq('derivative', sp('\\frac{dy}{dx}'), 'd y by d x');
eq('variance is a word', sp('\\operatorname{Var}(X)'), 'Var of X');
eq('negative vs minus', sp('-x - y'), 'negative x minus y');
eq('thousands', sp('1{,}000'), '1,000');
eq('unknown cmd no backslash', /\\/.test(sp('\\foo{x} \\bar y')), false);

const S = C.splitSentences;
eq('split basic', S('Hello world. This is two. Is it?  Yes!'), ['Hello world.', 'This is two.', 'Is it?', 'Yes!']);
eq('split abbrev', S('See Fig. 2 for e.g. the result. Then 3.14 is pi.'), ['See Fig. 2 for e.g. the result.', 'Then 3.14 is pi.']);
eq('split initial', S('Dr. J. Smith wrote it. Good.'), ['Dr. J. Smith wrote it.', 'Good.']);
eq('split token', S('So \u27e60\u27e7. Next one.'), ['So \u27e60\u27e7.', 'Next one.']);

const M = C.extractMath('Cost is $5 and $6 total. Let $x^2$ be, and $$a=b$$ done \\(y\\).');
eq('math count', M.maths.map(m => [m.tex, m.display]), [['x^2', false], ['a=b', true], ['y', false]]);

// full build with stubs
const doc = C.buildDocument('# Title\n\nFirst sentence with $x^2$. Second one.\n\n$$\\frac{a}{b}$$\n\n- item one\n- item two\n\n```\ncode here\n```\n', {
  renderMath: (t, d) => '[' + t + ']', parseInline: s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), parseBlock: s => '<pre>' + s + '</pre>' });
console.log(doc.html);
eq('units', doc.units.map(u => u.speak), ['Title.', 'First sentence with x squared.', 'Second one.', 'Equation. ay over b.', 'item one', 'item two']);

const md = C.texToMd('\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nSome \\textbf{bold} text % comment\n\\begin{itemize}\\item A\\item B\\end{itemize}\n\\begin{equation}E=mc^2\\end{equation}\n\\end{document}');
console.log(md);
eq('tex has heading', /## Intro/.test(md) && /\*\*bold\*\*/.test(md) && !/comment/.test(md), true);

// code is never math
const CM = C.extractMath('Run `echo $HOME $1` then:\n\n```bash\nP=$HOME; echo $1 $2\n```\n\nAnd $x^2$ is math.');
eq('code not math', CM.maths.map(m => m.tex), ['x^2']);
eq('code preserved', /echo \$HOME \$1/.test(CM.text) && /P=\$HOME; echo \$1 \$2/.test(CM.text), true);

// chunking never splits inside code or display math, and loses nothing
let big = ''; for (let i = 0; i < 300; i++) big += '# Ch ' + i + '\n\n' + 'Text '.repeat(200) + '\n\n$$\na = b\n\nc = d\n$$\n\n```\ncode\n\n# not a heading\n```\n\n';
const chs = C.splitChunks(big, 3000, 9000);
eq('chunks rejoin', chs.join('\n'), big);
eq('chunks > 1', chs.length > 10, true);
eq('no chunk breaks a fence/display', chs.every(c => ((c.match(/```/g) || []).length % 2 === 0) && ((c.match(/\$\$/g) || []).length % 2 === 0)), true);

// table of contents
const SH = C.scanHeadings('# One\n\ntext\n\n```bash\n# not a heading\n```\n\n## Two $x^2$\n\n## Two $x^2$\n\n### **Bold** [link](http://x)\n');
eq('toc scan', SH.map(h => [h.level, h.title, h.n]), [[1, 'One', 0], [2, 'Two', 0], [2, 'Two', 1], [3, 'Bold link', 0]]);
const TD = C.buildDocument('# One\n\ntext here.\n\n## Two\n\nmore. text.\n', { renderMath: () => '', parseInline: s => s, parseBlock: s => s });
eq('toc heading units', TD.headings.map(h => [h.title, h.unit]), [['One', 0], ['Two', 2]]);
const TM = C.texToMd('\\chapter{Intro}\n\\section{On $f_{x}$ and {braces}}\n\\section*{Star}\n');
eq('tex headings nested braces', TM.trim().split(/\n+/), ['# Intro', '## On $f_{x}$ and braces', '## Star']);

// a realistic LaTeX file: custom macros, theorem/proof, aligned equations, figure, list, verbatim
const fs = require('fs'), path = require('path');
const texMd = C.texToMd(fs.readFileSync(path.join(__dirname, 'sample.tex'), 'utf8'));
const strip = s => s.replace(/\*\*/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2');
const texUnits = C.buildDocument(texMd, { renderMath: () => '', parseInline: strip, parseBlock: x => x, readCode: true }).units.map(u => u.speak).join('\n');
eq('tex: macros expanded (\\norm, \\inner, \\argmax, \\eps)', /the 2 norm of x/.test(texUnits) && /the inner product of x and y/.test(texUnits) && /the argmax over y of/.test(texUnits) && /epsilon/.test(texUnits), true);
eq('tex: \\R is the real numbers, R^n is "R n"', /f colon R n to the real numbers/.test(texUnits), true);
eq('tex: big O and trace read as functions', /O of the norm of h squared/.test(texUnits) && /Tr of A transpose A/.test(texUnits), true);
eq('tex: aligned rows stay separate sentences', /equals f of x plus the inner product of nabla f of x and h plus O of the norm of h squared\. Tr of/.test(texUnits), true);
eq('tex: figure reduced to its caption, footnote and url as text', /Figure\. Loss versus iteration for three step sizes/.test(texUnits) && /\(See \[citation\] for details/.test(texUnits) && /https:\/\/example\.com/.test(texUnits), true);
eq('tex: verbatim code survives (% is not a comment)', /print\(i % 3\)/.test(texMd), true);
eq('tex: nothing of LaTeX leaks into speech', /\\(begin|end|includegraphics|caption|footnote|url|newcommand)|\{|\}/.test(texUnits), false);
eq('frac13 shorthand', sp('\\frac13 + x^23'), 'one third plus x squared 3');
const IT = C.texToMd('\\begin{enumerate}\\item[(a)] First \\item Second\\end{enumerate}');
eq('item labels kept', /1\. \(a\)\s+First/.test(IT), true);
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
