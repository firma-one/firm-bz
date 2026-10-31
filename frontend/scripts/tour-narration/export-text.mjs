#!/usr/bin/env node
/**
 * Prints what every /tour step card says aloud, as JSON, for generate.py:
 * { voice, clips: [{ key, text, hash }], lines: [{ key, out, text, hash }] }. Loads the steps
 * themselves (TSX, with the app's `@/` imports) through jiti, so the text read aloud is always the
 * cards' own. `lines` are Brio's other recordings, outside the tour: "Hear Brio" on the landing page.
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

const { narrationEntries, narrationHash, pinPronunciation } = await jiti.import(path.join(frontend, 'lib/demo/tour-narration-text.ts'))
const { NARRATION_VOICE } = await jiti.import(path.join(frontend, 'lib/demo/tour-narration.ts'))
const { HEAR_BRIO_SPOKEN } = await jiti.import(path.join(frontend, 'components/marketing/v2/home/hear-brio-line.ts'))

const line = (key, out, spoken) => {
    const text = pinPronunciation(spoken)
    return { key, out, text, hash: narrationHash(text) }
}
const lines = [line('hear-brio', 'public/marketing/hear-brio', HEAR_BRIO_SPOKEN)]

process.stdout.write(`${JSON.stringify({ voice: NARRATION_VOICE, clips: narrationEntries(), lines }, null, 2)}\n`)
