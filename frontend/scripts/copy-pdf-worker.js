#!/usr/bin/env node
/**
 * Copy the pdf.js worker into public/ so it is served at a stable, bundler-independent
 * URL (`/pdf.worker.min.mjs`).
 *
 * Why not let the bundler resolve it: dev runs Turbopack while `npm run build` runs
 * webpack, and pdfjs resolves its worker relative to the emitted chunk directory — the
 * same failure mode already documented for `pdf-parse` in next.config.js
 * (`serverExternalPackages`). Serving a copy from public/ sidesteps both bundlers.
 *
 * The copy is generated (gitignored) and therefore always pinned to whatever version of
 * pdfjs-dist is installed — see document-pdf-preview-pane.tsx, which asserts that the
 * worker and the API agree on version at runtime.
 */
const fs = require('fs')
const path = require('path')

const WORKER = 'pdf.worker.min.mjs'

function main() {
  let src
  try {
    src = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build', WORKER)
  } catch {
    console.error(`[copy-pdf-worker] pdfjs-dist is not installed — cannot copy ${WORKER}.`)
    process.exit(1)
  }

  if (!fs.existsSync(src)) {
    console.error(`[copy-pdf-worker] expected worker at ${src} but it does not exist.`)
    process.exit(1)
  }

  const publicDir = path.join(__dirname, '..', 'public')
  fs.mkdirSync(publicDir, { recursive: true })
  const dest = path.join(publicDir, WORKER)

  // Skip the write when the copy is already current — keeps `next dev` restarts cheap
  // and avoids touching a file the dev server is watching.
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) {
    return
  }

  fs.copyFileSync(src, dest)
  const version = require('pdfjs-dist/package.json').version
  console.log(`[copy-pdf-worker] copied ${WORKER} (pdfjs-dist ${version}) -> public/`)
}

main()
