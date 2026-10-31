import { existsSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { NARRATION_MANIFEST, NARRATION_VOICE, narrationClip } from '@/lib/demo/tour-narration'
import { narrationEntries, narrationHash } from '@/lib/demo/tour-narration-text'
import { tourSteps } from '@/components/demo/demo-tour-steps'

const CLIPS = resolve(__dirname, '../../public/tour/narration')
const REMAKE = 'run scripts/tour-narration/generate.py (see its header) to remake the clips'

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
        const files = readdirSync(CLIPS).filter((file) => file.endsWith('.m4a'))
        expect(files.filter((file) => !keys.has(file.replace(/\.m4a$/, ''))), REMAKE).toEqual([])
    })

    it('reads a card as a screen reader would hear it', () => {
        const [askBrio] = tourSteps('brio')
        const text = narrationEntries().find((entry) => entry.key === 'brio-1')?.text
        // Brio's "AI" subscript is hidden from screen readers, so the narrator says "Brio".
        expect(text).toMatch(/^Ask Brio\. Ask Brio about this engagement/)
        expect(text).not.toContain('AI')
        expect(narrationClip(askBrio)).toEqual({ src: '/tour/narration/brio-1.m4a', seconds: NARRATION_MANIFEST.clips['brio-1'].seconds })
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
