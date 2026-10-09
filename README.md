# LMK-reDing-app-

Personal Markdown + LaTeX reader with free, natural text-to-speech (Kokoro) that runs entirely in the browser.
Add `.md` / `.tex` / `.txt` / `.pdf` files, press play, tap any sentence to jump, use **Contents** to jump to a chapter. Files and progress stay on your device.

PDFs: text is extracted in the browser (headers, footers and page numbers removed; the PDF's own bookmarks become the contents). Scanned/image-only PDFs need OCR first. Math inside PDFs comes out as plain symbols, not LaTeX.

Run locally: `python3 -m http.server` in this folder, then open `localhost:8000`.
Tests: `node tests/core.test.js`
