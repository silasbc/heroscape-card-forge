# Card Forge — Heroscape army card maker

Design, save and print custom Heroscape army cards in the browser. No account, no server, nothing to install.

**Live app:** https://silasbc.github.io/heroscape-card-forge/

## What it does

- **Two card styles.** The current Renegade *Age of Annihilation* (2024) design is drawn entirely as vectors, so it prints crisp at any size. The classic 2004–2010 frames (Rise of the Valkyrie, Swarm of the Marro, Dungeon set) are composited on scanned blanks.
- **Both sides.** Master side (stats, powers, hit zone) and Basic side (big art, basic stats, collector block), for double-sided printing.
- **Every General.** Jandar, Utgar, Ullar, Vydar, Einar, Aquilla, Valkrill, Revna and Volarak with the official colours, plus a custom General with your own colour and emblem.
- **Figure photos.** Upload a photo of the mini on a plain background. The background is removed in the browser with a neural matting model (runs on the GPU when available, CPU otherwise, nothing is uploaded anywhere), or with a fast plain‑background keyer. Drag, pinch and scroll to place the figure.
- **Hit‑zone silhouette.** Built automatically from the cutout: red hit zone, paintable grey "cannot be targeted" parts, and the green Target Point. Squads get one silhouette per figure, laid out like the official cards.
- **Official data.** 329 official special powers to insert by name, and 536 official units to start from.
- **Print.** PNG at 300 or 600 dpi (true size, 4.85 in wide) and a PDF print sheet with two cards per page, Master pages followed by Basic pages for duplex printing, with cut guides.
- **Save files.** Cards autosave in the browser. Every exported PNG carries the card data inside it, so dropping a PNG back into the app restores it for editing. JSON backups of one or all cards are also available.

## Running locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (the app lives under `/heroscape-card-forge/`).

`npm run build` produces the static site in `dist/`; `npm run deploy` publishes it to GitHub Pages.

## How it is built

- Vite + React + TypeScript, single static site.
- Cards are rendered with the Canvas 2D API in a card‑unit coordinate space and rasterised at whatever pixel size is needed (screen, 300 dpi, 600 dpi).
- Background removal uses `onnxruntime-web` in a Web Worker with the ISNet model (`onnx-community/ISNet-ONNX`, 44–88 MB, fetched once from Hugging Face and cached in the browser). A higher‑quality BiRefNet‑lite model (MIT) is available for GPU browsers.
- Persistence is IndexedDB via `idb-keyval`. PDFs are built with `jsPDF`.
- A tiny service worker (`coi-serviceworker`) enables cross‑origin isolation on GitHub Pages so the CPU fallback can use multiple threads.

## Credits and licences

- App code: MIT.
- Classic card blanks, general symbols and layout coordinates come from the MIT‑licensed [heroscape‑mse](https://github.com/BrianMacIntosh/heroscape-mse) Magic Set Editor template by bmaczero.
- Unit data from the community database at heroscape.org; power texts from the heroscape‑mse keyword library.
- Fonts: Barlow, Barlow Condensed, Barlow Semi Condensed and Saira Condensed (SIL Open Font License).
- Heroscape and all related characters are trademarks of Hasbro; the current game is published by Renegade Game Studios. This is a fan‑made tool for personal, non‑commercial use and is not endorsed by or associated with either company.
