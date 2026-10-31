#!/usr/bin/env node
/**
 * Prints what every /tour step card says aloud, as JSON, for generate.py:
 * { voice, clips: [{ key, text, hash }] }. Loads the steps themselves (TSX, with the app's `@/`
 * imports) through jiti, so the text read aloud is always the cards' own.
 *
 *   node scripts/tour-narration/export-text.mjs
 */
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const jiti = createJiti(import.meta.url, {
    alias: { '@': frontend },
    jsx: { runtime: 'automatic' },
})

const { narrationEntries } = await jiti.import(path.join(frontend, 'lib/demo/tour-narration-text.ts'))
const { NARRATION_VOICE } = await jiti.import(path.join(frontend, 'lib/demo/tour-narration.ts'))

process.stdout.write(`${JSON.stringify({ voice: NARRATION_VOICE, clips: narrationEntries() }, null, 2)}\n`)
