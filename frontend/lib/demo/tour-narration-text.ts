import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tourSteps, type TourRunStep } from '@/components/demo/demo-tour-steps'
import { NARRATION_VOICE, narrationKey } from '@/lib/demo/tour-narration'

/**
 * What each step card says aloud: its title, then its copy, as a screen reader would hear them
 * (what's hidden from one, like Brio's "AI" subscript and the icons, is left out), or the step's
 * own `spoken` text where the card doesn't read well aloud. For the clip generator
 * (scripts/tour-narration) and the tests, not the page: it renders the cards to markup.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'", nbsp: ' ' }

/** A card's title or copy as plain sentences. */
function toSpeech(node: ReactNode): string {
    const html = renderToStaticMarkup(createElement(Fragment, null, node))
    const lines = html
        .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, '')
        .replace(/<\/(p|li|ul|ol|div)>|<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (_, name: string) => ENTITIES[name])
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    // Each line its own sentence, so a list's items don't run together.
    return lines.map((line) => (/[.!?:;]$/.test(line) ? line : `${line}.`)).join(' ')
}

/**
 * Words Kokoro can say in the wrong sense, pinned to the one this tour's copy always means, in its
 * phonemes (misaki's). It guesses a heteronym from the sentence around it, so the same words can
 * come out right on one card and wrong on another: "your firm lives here" came out as the plural
 * of "life" on the Clients card while two other cards' "lives here" were fine.
 */
const PRONOUNCE: Record<string, string> = {
    lives: 'lˈɪvz',
}

/** The text with each pinned word in Kokoro's `[word](/phonemes/)` form. */
function pinPronunciation(text: string): string {
    return text.replace(/[A-Za-z]+/g, (word) => {
        const phonemes = PRONOUNCE[word.toLowerCase()]
        return phonemes ? `[${word}](/${phonemes}/)` : word
    })
}

export function narrationText(step: TourRunStep): string {
    return pinPronunciation(step.spoken ?? `${toSpeech(step.title)} ${toSpeech(step.content)}`)
}

/** FNV-1a: a short, stable fingerprint of what a clip says and in which voice. */
export function narrationHash(text: string, voice: string = NARRATION_VOICE): string {
    let hash = 0x811c9dc5
    for (const char of `${voice}\n${text}`) {
        hash ^= char.codePointAt(0) ?? 0
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}

/** Every step of the whole tour, with the clip it should have. */
export function narrationEntries(): { key: string; text: string; hash: string }[] {
    return tourSteps(null).map((step) => {
        const text = narrationText(step)
        return { key: narrationKey(step), text, hash: narrationHash(text) }
    })
}
