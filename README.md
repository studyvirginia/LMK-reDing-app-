# LMK-reDing-app-

Personal Markdown + LaTeX reader with free, natural text-to-speech (Kokoro) that runs entirely in the browser.
Add `.md` / `.tex` / `.txt` / `.pdf` files, press play, tap any sentence to jump, use **Contents** to jump to a chapter. Files and progress stay on your device.

PDFs: text is extracted in the browser (headers, footers and page numbers removed; the PDF's own bookmarks become the contents). Scanned/image-only PDFs need OCR first. Math inside PDFs comes out as plain symbols, not LaTeX.

Run locally: `python3 -m http.server` in this folder, then open `localhost:8000`.
Tests: `node tests/core.test.js`


## Natural voice

The natural voice (Kokoro, 82M parameters) runs entirely in your browser in a background worker; nothing is sent anywhere.
First use downloads the model once (about 90 MB, cached afterwards). Settings → **Test voice** checks every step and reports speed.
Settings → **Natural voice mode → Fast (graphics chip)** uses WebGPU (about 330 MB download) on devices that support it; it falls back to Standard automatically.
`coi-sw.js` is a tiny service worker that enables multi-threading (one automatic reload on first visit).

## Other features

- Time left: header shows time left in the current section and in the book; Contents shows each heading's length; Library shows time left per book. The speaking rate is learned from what is actually played.
- Code blocks are read aloud (symbols spoken as words, comments announced); turn off in Settings → Read code aloud.
- Math is read from the structure of the formula (not symbol by symbol): `f(x)` is "f of x", `P(A | B)` is "P of A given B", `{x : x > 0}` is "the set of x such that x is greater than 0", `\frac12` is "one half", `dy/dx` is "d y by d x", brackets only become "the quantity ..." when it matters.
- LaTeX files: `\newcommand`, `\def` and `\DeclareMathOperator` shortcuts are expanded; theorem/proof environments, figure and table captions, footnotes, links, lists and verbatim code are handled; equations are never mangled by the text clean-up.
