# LMK-reDing-app-

Personal Markdown + LaTeX reader with free, natural text-to-speech (Kokoro) that runs entirely in the browser.
Add `.md` / `.tex` / `.txt` / `.pdf` files, press play, tap any sentence to jump, use **Contents** to jump to a chapter. Files and progress stay on your device.

PDFs: text is extracted in the browser (headers, footers and page numbers removed; the PDF's own bookmarks become the contents). Scanned/image-only PDFs need OCR first. Math inside PDFs comes out as plain symbols, not LaTeX.

Run locally: `python3 -m http.server` in this folder, then open `localhost:8000`.
Tests: `node tests/core.test.js`


## Voices (with automatic backups)

Everything the voices need is hosted with the app (`models/`, `vendor/`), so nothing depends on an outside website.
If the chosen voice fails or is too slow for the speed you picked, the app moves to the next one by itself and says so:

1. **Kokoro** (best quality, ~90 MB, runs in a background worker; ~0.3-1x real time on weak CPUs, more on fast ones or with Fast/GPU mode)
2. **Kokoro on the page itself**, if background workers do not work in the browser
3. **Piper** (a different, much smaller and faster natural voice, ~65 MB; 4-5x real time on the same CPU)
4. **The device's own voice**, preferring "natural"/"neural"/"premium" voices when the device has them

If `models/kokoro` is ever missing, Kokoro falls back to downloading from huggingface.co.
Settings → **Test voice** checks the voice in use; **Test all backups** tests every engine and recommends one.
`coi-sw.js` enables multi-threading (one automatic reload on first visit).

## Other features

- Time left: header shows time left in the current section and in the book; Contents shows each heading's length; Library shows time left per book. The speaking rate is learned from what is actually played.
- Code blocks are read aloud (symbols spoken as words, comments announced); turn off in Settings → Read code aloud.
- Math is read from the structure of the formula (not symbol by symbol): `f(x)` is "f of x", `P(A | B)` is "P of A given B", `{x : x > 0}` is "the set of x such that x is greater than 0", `\frac12` is "one half", `dy/dx` is "d y by d x", brackets only become "the quantity ..." when it matters.
- LaTeX files: `\newcommand`, `\def` and `\DeclareMathOperator` shortcuts are expanded; theorem/proof environments, figure and table captions, footnotes, links, lists and verbatim code are handled; equations are never mangled by the text clean-up.
- Settings → **Math** and **Code**: read aloud, just say "equation" / "code block", or skip. Skipped material is still shown.
- The letter "a" in math is spelled "eigh" for the natural voices: speech engines read a bare "a" as the weak article ("uh") and "ay" as "eye".
