import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { NARRATION_MANIFEST, NARRATION_VOICE, narrationClip, narrationKey } from '@/lib/demo/tour-narration'
import { lineEntry, narrationEntries, narrationHash, shownWords } from '@/lib/demo/tour-narration-text'
import { alignWords, revealTimes, type SpokenWord } from '@/lib/demo/tour-read-along'
import { tourSteps } from '@/components/demo/demo-tour-steps'
import { HEAR_BRIO_CLIP, HEAR_BRIO_LINE, HEAR_BRIO_PAUSE, HEAR_BRIO_SPOKEN, HEAR_BRIO_TOUR } from '@/components/marketing/v2/home/hear-brio-line'

const CLIPS = resolve(__dirname, '../../public/tour/narration')
const REMAKE = 'run scripts/tour-narration/generate.py (see its header) to remake the clips'

/** When each word in a step's clip is spoken. */
function spokenWords(key: string): SpokenWord[] {
    return JSON.parse(readFileSync(resolve(CLIPS, `${key}.json`), 'utf8')).words
}

describe('tour narration', () => {
    it('is made in the voice the page names', () => {
        expect(NARRATION_MANIFEST.voice, REMAKE).toBe(NARRATION_VOICE)
    })

    it('has a current clip for every step', () => {
        for (const { key, text, hash } of narrationEntries()) {
            const clip = NARRATION_MANIFEST.clips[key]
            expect(clip, `${key} has no clip; ${REMAKE}`).toBeDefined()
            expect(clip.hash, `${key} says "${text}", but its clip was made from other words; ${REMAKE}`).toBe(hash)
            expect(existsSync(resolve(CLIPS, `${key}.m4a`)), `${key}.m4a is missing; ${REMAKE}`).toBe(true)
        }
    })

    it('keeps no clip that no step plays', () => {
        const keys = new Set(narrationEntries().map((entry) => entry.key))
        const files = readdirSync(CLIPS).filter((file) => /\.(m4a|json)$/.test(file) && file !== 'manifest.json')
        expect(files.filter((file) => !keys.has(file.replace(/\.(m4a|json)$/, ''))), REMAKE).toEqual([])
    })

    it('knows when each word of every clip is spoken, in order', () => {
        for (const { key } of narrationEntries()) {
            expect(existsSync(resolve(CLIPS, `${key}.json`)), `${key}.json is missing; ${REMAKE}`).toBe(true)
            const starts = spokenWords(key).map(([, start]) => start)
            expect(starts.length, key).toBeGreaterThan(0)
            expect(starts, key).toEqual([...starts].sort((a, b) => a - b))
        }
    })

    it('reveals every word a card shows when the narration says it', () => {
        for (const step of tourSteps(null)) {
            const key = narrationKey(step)
            const shown = shownWords(step)
            const times = alignWords(shown, spokenWords(key))
            // Words with letters in them; a lone "—" is never said.
            const wordy = shown.map((word, i) => ({ word, time: times[i] })).filter(({ word }) => /[a-z0-9]/i.test(word))
            const missed = wordy.filter(({ time }) => time === null).map(({ word }) => word)
            if (step.spoken) {
                // Read in other words ("⌘K" as "Command K"): those take the time of the words around them.
                expect(missed.length, `${key} misses ${missed.join(', ')}`).toBeLessThanOrEqual(Math.ceil(wordy.length * 0.25))
            } else {
                expect(missed, `${key}: these words on the card aren't said`).toEqual([])
            }
        }
    })

    it('fills a card in reading order, a word said differently with its neighbors', () => {
        const spoken: SpokenWord[] = [['Press', 0.1, 0.4], ['Command', 0.5, 0.8], ['K', 0.9, 1.0], ['anywhere', 1.2, 1.6]]
        expect(revealTimes(['Press', '⌘K', '—', 'anywhere'], spoken)).toEqual([0.1, 0.9, 0.9, 1.2])
        // A word the narration splits ("client-billable" said as two) still lines up.
        expect(alignWords(['client-billable', 'work'], [['client', 0.2, 0.5], ['billable', 0.5, 0.9], ['work', 1, 1.3]])).toEqual([0.2, 1])
    })

    it('reads a card as a screen reader would hear it', () => {
        const [askBrio] = tourSteps('brio')
        const text = narrationEntries().find((entry) => entry.key === 'brio-1')?.text
        // Brio's "AI" subscript is hidden from screen readers, so the narrator says "Brio".
        expect(text).toMatch(/^Ask Brio\. Ask Brio about this engagement/)
        expect(text).not.toContain('AI')
        expect(narrationClip(askBrio)).toEqual({
            src: '/tour/narration/brio-1.m4a',
            timings: '/tour/narration/brio-1.json',
            seconds: NARRATION_MANIFEST.clips['brio-1'].seconds,
        })
    })

    it('says a pinned word in the sense the copy means', () => {
        // "Every client workspace for your firm lives here": the verb, not the plural of "life".
        const text = narrationEntries().find((entry) => entry.key === 'all-clients-1')?.text
        expect(text).toContain('your firm [lives](/lˈɪvz/) here')
    })

    it('marks a clip for remaking when its words or its voice change', () => {
        expect(narrationHash('Files.')).toBe(narrationHash('Files.'))
        expect(narrationHash('Files.')).not.toBe(narrationHash('Files!'))
        expect(narrationHash('Files.', 'af_heart')).not.toBe(narrationHash('Files.'))
    })
})

describe('Hear Brio on the landing page', () => {
    const PUBLIC = resolve(__dirname, '../../public')
    const clip = JSON.parse(readFileSync(resolve(PUBLIC, `.${HEAR_BRIO_CLIP.timings}`), 'utf8')) as {
        hash: string
        seconds: number
        words: SpokenWord[]
        levels: number[]
    }

    it("has a clip made from the line as it stands, in Brio's voice", () => {
        expect(existsSync(resolve(PUBLIC, `.${HEAR_BRIO_CLIP.src}`)), REMAKE).toBe(true)
        const wanted = lineEntry('hear-brio', 'public/marketing/hear-brio', HEAR_BRIO_SPOKEN, HEAR_BRIO_PAUSE)
        expect(clip.hash, `the line or its pauses changed since its clip was made; ${REMAKE}`).toBe(wanted.hash)
    })

    it('says the brand "Firma" while the caption shows firmä', () => {
        expect(HEAR_BRIO_LINE).toContain('built into firmä.')
        expect(HEAR_BRIO_SPOKEN).toContain('built into Firma.')
        expect(HEAR_BRIO_SPOKEN).not.toContain('’')
    })

    it('reveals every word of the caption when Brio says it', () => {
        const shown = HEAR_BRIO_LINE.split(' ')
        const missed = alignWords(shown, clip.words).map((time, i) => (time === null ? shown[i] : null)).filter(Boolean)
        expect(missed, 'these words in the caption aren’t said').toEqual([])
    })

    it('ends on the tour invitation, and the tour it opens has Read aloud on', () => {
        expect(HEAR_BRIO_LINE).toMatch(/Come and see me at work: take the product tour, and I’ll show you around\.$/)
        // The invitation is the clip's last sentence, spoken.
        expect(clip.words.slice(-4).map(([word]) => word.replace(/[^A-Za-z]/g, '')).join(' ')).toBe('Ill show you around')
        expect(HEAR_BRIO_TOUR).toBe('/tour?narration=on')
    })

    it('leaves a little more room between sentences, without slowing the words', () => {
        const starts = (word: string) => clip.words.findIndex(([said]) => said.replace(/[^A-Za-z]/g, '') === word)
        // The gap after "built into Firma." is Kokoro's own and the extra pause.
        const i = starts('Firma')
        expect(clip.words[i + 1][1] - clip.words[i][2]).toBeGreaterThanOrEqual(HEAR_BRIO_PAUSE)
        // Inside a sentence, words still follow each other closely.
        const j = starts('executive')
        expect(clip.words[j + 1][1] - clip.words[j][2]).toBeLessThan(0.2)
    })

    it('knows how loud the voice is through the whole clip, for its wave', () => {
        expect(clip.levels.length).toBeGreaterThanOrEqual(Math.floor(clip.seconds * 20) - 1)
        expect(clip.levels.every((level) => level >= 0 && level <= 1)).toBe(true)
        expect(Math.max(...clip.levels)).toBe(1)
    })
})
