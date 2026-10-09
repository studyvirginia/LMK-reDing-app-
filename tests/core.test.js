const C = require('../core.js');
let fail = 0;
function eq(name, got, want) { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fail++; console.log('FAIL', name, '\n  got :', JSON.stringify(got), '\n  want:', JSON.stringify(want)); } else console.log('ok  ', name); }
const sp = C.texToSpeech;
eq('frac simple', sp('\\frac{a}{b}'), 'a over b');
eq('frac complex', sp('\\frac{a+1}{b}'), 'the fraction a plus 1 over b, end fraction');
eq('square', sp('x^2 + y^2 = z^2'), 'x squared plus y squared equals z squared');
eq('sqrt', sp('\\sqrt{x}'), 'square root of x');
eq('sum', sp('\\sum_{i=1}^{n} x_i'), 'the sum from i equals 1 to n of x sub i');
eq('int', sp('\\int_0^1 f(x)\\,dx'), 'the integral from 0 to 1 of f, x, d x');
eq('greek', sp('\\alpha + \\beta'), 'alpha plus beta');
eq('lim', sp('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'), 'the limit as x goes to 0 the fraction sin x over x, end fraction equals 1');
eq('power', sp('e^{i\\pi}'), 'e to the power i pi, end power');
eq('leq', sp('a \\leq b'), 'a is at most b');
eq('matrix', sp('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'), 'the matrix with 2 rows. row 1: a, b. row 2: c, d. end matrix');
eq('abs', sp('|x| < 1'), 'absolute value of x end absolute value is less than 1');
eq('text', sp('x \\text{ if } y'), 'x if y');
eq('mathbb', sp('x \\in \\mathbb{R}'), 'x is in the real numbers');
eq('hat', sp('\\hat{x}'), 'x hat');
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
eq('units', doc.units.map(u => u.speak), ['Title.', 'First sentence with x squared.', 'Second one.', 'Equation. a over b.', 'item one', 'item two']);

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
eq('tex headings nested braces', TM.trim().split(/\n+/), ['# Intro', '## On $f_{x}$ and {braces}', '## Star']);
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
