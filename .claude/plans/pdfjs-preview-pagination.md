# PDF.js preview pane with page x/y + jump-to-page

Date: 2026-10-07
Branch: dev
Scope: engagement file preview, both OneDrive and Google Drive connectors.

## Problem

Preview is an `<iframe>` at `/api/projects/:id/documents/:docId/preview#toolbar=0&zoom=N`.
Both connectors converge on `application/pdf` bytes, rendered by the browser's native
PDF viewer with its toolbar hidden. Consequences:

- No page indicator at all (toolbar=0 removed the only one).
- JS cannot read current page or total pages from a native viewer document, even
  same-origin. No scroll events either.
- `key={previewUrl}` remounts the iframe on every zoom step and the route sends
  `Cache-Control: no-store`, so **every zoom click re-fetches and re-converts the whole
  file** through Graph / Drive export.

## Decision

Replace the renderer with pdf.js (Option C). It is the only option giving a live
`x of y`, and it also removes the per-zoom re-conversion because bytes load once.

Chosen over `react-pdf`: `pdfjs-dist` is already in the tree transitively
(officeparser -> 6.1.200 hoisted, pdf-parse -> 5.4.296 nested). `react-pdf` would pull
a third copy and lags upstream. Direct use costs ~40 extra lines.

## Design

New `components/files/document-pdf-preview-pane.tsx`.

- Fetches the preview URL **once** into an ArrayBuffer, reads `Content-Type`.
- `application/pdf` -> pdf.js canvas renderer.
- anything else (images, the unsupported-HTML fallback) -> delegate to the **existing**
  `DocumentBlobPreviewPane`, untouched, so non-PDF behaviour is byte-identical.
- Continuous vertical scroll, virtualized: canvases only for current page +/- 2,
  other pages are placeholder divs at the correct height.
- Exact heights known upfront: `getPage(i).getViewport({scale:1})` for every page in
  parallel at load, cached. Avoids scroll jumps from estimated heights. Also warms
  pdf.js's page cache.
- Current page from scroll math against cumulative offsets (rAF-throttled), not
  IntersectionObserver - we already know exact heights, so offsets are deterministic.
- Zoom 50-200 step 15 default 100, same as today, re-rasters canvas only. Current page
  is held in place across a zoom change.
- Toolbar: `[-] 100% [+] [reset] | Page [input] / N`. Input commits on Enter/blur,
  clamped to 1..N, reverts to current page on invalid.
- devicePixelRatio-aware canvas sizing; in-flight `RenderTask`s cancelled on
  zoom change / unmount.

## Worker

Dev runs Turbopack, prod builds `--webpack`. `next.config.js` already documents a
pdfjs worker resolution failure (`serverExternalPackages` comment). So do not let
either bundler resolve the worker:

- `scripts/copy-pdf-worker.js` copies `pdfjs-dist/build/pdf.worker.min.mjs` into
  `public/`.
- Wired into both `dev` and `build` scripts.
- `GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` set explicitly.
- `public/pdf.worker.min.mjs` gitignored (generated, pinned to node_modules).

## Call sites (4, props unchanged)

- components/projects/engagement-file-list.tsx:332
- components/projects/shares/engagement-shares-tab.tsx:1885
- components/projects/shares/engagement-shares-tab.tsx:2214
- components/ui/document-action-menu.tsx:11

## Not doing in this round

- Text layer / selection / in-document search. No selection today, so not a regression.
- Touching the preview route or either content adapter. Server side is unchanged.
- Deleting the old pane. Stays intact and reachable by reverting imports, per standing
  rule: no deletion until Deepak tests and signs off.

## Risks

1. Worker path differing between Turbopack dev and webpack prod -> pinned by serving
   from /public.
2. pdf.js slower than PDFium on first paint and on large scanned PDFs. Accepted:
   the dominant cost (server-side conversion) is unchanged, and zoom/page-jump go from
   a full re-conversion to a local re-raster.
3. Fast scrolling can outrun the renderer -> +/-2 page render-ahead and correctly
   sized placeholders.
4. Memory on very long documents -> canvases outside the window are unmounted.
5. Encrypted / malformed PDFs -> load failure must fall back to the legacy iframe pane
   rather than showing a broken toolbar.

## Steps

1. Add pdfjs-dist ^6.1.200 as a direct dep.
2. scripts/copy-pdf-worker.js + package.json wiring + .gitignore.
3. document-pdf-preview-pane.tsx.
4. Repoint the 4 call sites.
5. typecheck + build.

---

## As built (2026-10-07)

Implemented as planned, with three deviations worth recording:

1. **100% now means fit-to-pane-width**, not "actual size" as the native viewer's
   `zoom=100` meant. In a narrow side dock, fit-to-width is what a reader wants, and it
   keeps the 50-200% range meaningful at any pane width. This is the one visible
   behaviour change beyond the new control.
2. **Scroll-offset math, not IntersectionObserver**, for the current page. Exact page
   heights are known upfront, so a lookup against cumulative offsets is cheaper and does
   not jitter at page boundaries. The probe point is one third down the viewport.
3. Two bugs caught on self-review after the first build:
   - above 100% the page stack did not claim the extra width, so the overflow was
     unreachable (pages are centre-positioned; the left half sat at a negative offset).
     `layout.totalWidth` now sizes the stack.
   - `scrollbar-gutter: stable`, because scrollbar visibility feeds measured width feeds
     fit-to-width scale feeds content height feeds scrollbar visibility.

`destroy()` is on `PDFDocumentLoadingTask`, not `PDFDocumentProxy` — teardown holds the
task so the worker is torn down too.

### Verified
- `tsc --noEmit` clean.
- `next build --webpack` compiles (the production bundler path).
- Worker serves at `/pdf.worker.min.mjs`: 200, `application/javascript`, 1255067 bytes,
  over the running Turbopack dev server — so both bundler paths are covered.
- pdf.js 6.1.200 API shape confirmed against the installed copy: `getDocument({data})`,
  `numPages`, `getPage(i).getViewport({scale:1})`, `loadingTask.destroy()`. Mixed page
  sizes (612x792 / 1008x612) come back distinctly, which is the case the per-page
  measurement exists for.

### Not verified — needs Deepak
End-to-end render in the app. The in-app browser has no session for localhost:3000, so
no real OneDrive/GDrive file was opened through the new pane.

---

## Round 2 — toolbar build-out (same session)

**Toolbar shape fix.** The page group was gated behind `totalPages > 0`, so during load the
bar rendered zoom-only — visually identical to the old toolbar, which read as the old one
being swapped for the new. The toolbar now renders its final shape from the first frame:
page controls always mounted, showing `–` and disabled until `ready`.

**Added, all additive — no existing control removed:**
- prev / next page (`scrollToPage` already existed)
- zoom preset dropdown, 50/75/100/125/150/200. The `%` readout became a dropdown trigger,
  so clicking it no longer resets; reset survives via the existing reset button and the
  100% preset.
- fit-width / fit-page toggle. Fit-width stays the default, so prior behaviour is unchanged.
- rotate 90° per click. `getViewport({rotation})` REPLACES the page's intrinsic `/Rotate`
  rather than adding to it, so it is composed as `page.rotate + rotation` — otherwise a
  scanned landscape page (intrinsic 90) snaps upright.
- drag-to-pan. No hand/select mode toggle needed: Acrobat needs one because dragging would
  otherwise select text, and there is no text layer yet. **When the text layer lands, the
  toggle becomes necessary** — noted at that spot in the code.

Rotate and fit-mode re-anchor on the current page through the same `pendingPageRef`
mechanism as zoom.

**Full-screen stacking bug.** Radix portals menu and tooltip content to `document.body` at
`z-50`, while the right panel's full-screen state is `fixed inset-0 z-[100]`
(layout-right-panel.tsx:206). The zoom menu opened *behind* the overlay — it still trapped
focus, so it read as a dead control. Tooltips had the same bug, predating this work.
Raised to `z-[110]` **at these call sites only**; changing the shared primitives would
reorder every dropdown and tooltip in the app against modals, sheets and toasts. The
global cleanup is tracked separately.

---

## Round 3 — navigation aids

- **Bookmarks / outline.** `getOutline()`, with every destination resolved to a page number
  at load so clicking is instant. A bookmark pointing at a destination the document does
  not define renders as non-clickable rather than failing the whole outline. External-URL
  bookmarks are skipped — this is an in-document navigator. The tab appears only when the
  document actually has bookmarks; Word exports headings as PDF bookmarks, so converted
  .docx files usually do and many native PDFs do not.
- **Thumbnails.** Share one tabbed sidebar with bookmarks rather than two panels competing
  for width in a narrow dock. Each thumbnail mounts its canvas only once it scrolls into
  the strip, so a 200-page document does not raster 200 bitmaps to open a sidebar. They
  reuse the measured page dims, so they rotate with the document.
- **Keyboard shortcuts.** PageUp/PageDown and Space/Shift+Space by page, Home/End,
  `+`/`-`/`0`. Bound to the scroll area, not the window, so the viewer never steals keys
  from the rest of the page; suppressed when focus is in the page input.
- **Rotate left**, alongside rotate right.

Opening the sidebar needed no extra wiring: the ResizeObserver already watches the scroll
container, so the narrower container reflows the fit-to-width scale on its own.

### Considered and removed: document properties
Built as a `getMetadata()` popover, then cut entirely. PDF metadata describes the
*conversion*, not the file — for a .docx the Producer is the converter and Author/Creator/
Title carry whatever Word had, which can be stale or simply the wrong person's name next to
a file in a client engagement. Trimming it to the two trustworthy fields left Name (already
in the preview header) and Pages (already in the toolbar's `/ N`), i.e. a button that opens
a menu to show what is already on screen. `getMetadata()` is not called at all.

### Known gap
The thumbnail strip does not auto-scroll to follow the current page as the document
scrolls. Acrobat does this; left out deliberately.

### Note
Reset-zoom moved from `RotateCcw` to `Undo2`: rotate-left needed `RotateCcw`, and the same
glyph cannot mean two things in one toolbar.

---

## Round 4 — 400% ceiling

Raised from 200% because zoom here is relative to fit-width, so the useful ceiling depends
on page size: a Google Sheet exported to XLSX converts to one page sized to the whole used
range, which is illegible at 200%.

Not a one-line change, because an unguarded 400% raster is large enough to fail:

- **Canvas budget.** 64M device px and 16k per edge; past that the backing store renders
  below device resolution and CSS upscales, so the page goes soft rather than blank
  (browsers refuse the allocation outright otherwise). Sized so a retina A4 at the old 200%
  ceiling lands just inside it — nothing that renders sharply today starts rendering softly.
  Measured at a 1700px pane, retina: A4 keeps 2.0x at 200%, drops to 1.38x at 300% and
  1.03x at 400%; a sheet-sized page keeps 2.0x through 300% and eases to 1.53x at 400%.
- **Coarser steps above 200%** (50, not 15), so 400 is not twenty clicks. 200<->250
  round-trips cleanly.
- **Render window tightened to +/-1 above 200%**, since one canvas up there can be ~256MB.

Known trade-off: at the cap a single canvas is ~256MB and up to three can be live. A
tighter budget would have softened A4 at 200%, judged the worse regression. If memory
bites in practice, dropping render-ahead to 0 above 300% is the lever.

### Root cause this does not fix
Neither connector passes any layout parameters to its converter — OneDrive sends
`/content?format=pdf`, Drive sends `files/{id}/export?mimeType=application/pdf` (and
copy-converts an uploaded XLSX to a Google Sheet first). Page size, orientation, scaling
and sheet breaks are all decided by the provider from the workbook's own print setup, and a
Sheets-authored file has none. Zoom treats the symptom.

Drive could be fixed properly: `docs.google.com/spreadsheets/d/{id}/export?format=pdf`
accepts `fitw`, `portrait`, `gid`, gridlines and margins — a different endpoint from the
Drive v3 `/export` used today, which accepts none of them. Graph exposes no equivalent, so
this would improve spreadsheets on Drive and leave OneDrive unchanged. Decide deliberately.
