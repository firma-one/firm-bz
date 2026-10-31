import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tourSteps, type TourRunStep } from '@/components/demo/demo-tour-steps'
import { NARRATION_PAUSES, NARRATION_VOICE, narrationKey, type NarrationPauses } from '@/lib/demo/tour-narration'

/**
 * What each step card says aloud: its title, then its copy, as a screen reader would hear them
 * (what's hidden from one, like Brio's "AI" subscript and the icons, is left out), just the copy
 * when it opens with the title's word, or the step's own `spoken` text where the card doesn't read
 * well aloud. For the clip generator
 * (scripts/tour-narration) and the tests, not the page: it renders the cards to markup.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'", nbsp: ' ' }

/** A card's title or copy as its lines of text, as a screen reader would hear them. */
function textLines(node: ReactNode): string[] {
    const html = renderToStaticMarkup(createElement(Fragment, null, node))
    return html
        .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, '')
        .replace(/<\/(p|li|ul|ol|div)>|<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (_, name: string) => ENTITIES[name])
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
}

/** A card's title or copy as plain sentences: each line its own, so a list's items don't run together. */
function toSpeech(node: ReactNode): string {
    return textLines(node).map((line) => (/[.!?:;]$/.test(line) ? line : `${line}.`)).join(' ')
}

/** The words a card shows in its title and in its copy, as the step card reveals them (demo-tour.tsx). */
export function cardWords(step: TourRunStep): { title: string[]; copy: string[] } {
    const words = (node: ReactNode) => textLines(node).join(' ').split(' ').filter(Boolean)
    return { title: words(step.title), copy: words(step.content) }
}

export function shownWords(step: TourRunStep): string[] {
    const { title, copy } = cardWords(step)
    return [...title, ...copy]
}

/** A word's letters, lowercased and without a plural "s": how a title's last word and the copy's first are compared. */
function stem(word = ''): string {
    return word.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '')
}

/**
 * Whether the card's copy opens with the word its title ends on ("Home", then "Home picks up where
 * you left off…"; "Firm overview", then "Overview shows…"). Read aloud, the title would run straight
 * into the same word, which sounds like a stutter, so Brio reads only the copy: it names the place
 * itself. The title still comes up on the card as Brio starts.
 */
export function copyOpensWithTitle(step: TourRunStep): boolean {
    const { title, copy } = cardWords(step)
    const last = stem(title[title.length - 1])
    return last !== '' && last === stem(copy[0])
}

/**
 * Words Kokoro can say in the wrong sense, pinned to the one this tour's copy always means, in its
 * phonemes (misaki's). It guesses a heteronym from the sentence around it, so the same words can
 * come out right on one card and wrong on another: "your firm lives here" came out as the plural
 * of "life" on the Clients card while two other cards' "lives here" were fine, and Hear Brio's "I
 * never read what's inside your documents" came out in the past tense ("red").
 */
const PRONOUNCE: Record<string, string> = {
    lives: 'lˈɪvz',
    // Present tense ("reed"), as everywhere in this copy.
    read: 'ɹˈid',
}

/** The text with each pinned word in Kokoro's `[word](/phonemes/)` form: the tour's cards, and Brio's other recordings. */
export function pinPronunciation(text: string): string {
    return text.replace(/[A-Za-z]+/g, (word) => {
        const phonemes = PRONOUNCE[word.toLowerCase()]
        return phonemes ? `[${word}](/${phonemes}/)` : word
    })
}

export function narrationText(step: TourRunStep): string {
    const said = copyOpensWithTitle(step) ? toSpeech(step.content) : `${toSpeech(step.title)} ${toSpeech(step.content)}`
    return pinPronunciation(step.spoken ?? said)
}

/** The hash of what a clip says and the pauses it's said with, so a change to either marks it for remaking. */
function clipHash(text: string, pauses: NarrationPauses): string {
    const notes = [
        pauses.sentence ? `[+${pauses.sentence}s between sentences]` : '',
        pauses.clause ? `[+${pauses.clause}s at colons, semicolons and dashes]` : '',
        pauses.comma ? `[+${pauses.comma}s at commas and brackets]` : '',
    ].filter(Boolean)
    return narrationHash([text, ...notes].join('\n'))
}

/**
 * One of Brio's recordings outside the tour (Hear Brio on the landing page), for the generator: its
 * text as spoken, with the tour's pronunciation pins, the extra pauses at its punctuation, and the
 * hash that marks it for remaking when either changes.
 */
export function lineEntry(key: string, out: string, spoken: string, pauses: NarrationPauses = {}) {
    const text = pinPronunciation(spoken)
    return { key, out, text, pauses, hash: clipHash(text, pauses) }
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
export function narrationEntries(): { key: string; text: string; pauses: NarrationPauses; hash: string }[] {
    return tourSteps(null).map((step) => {
        const text = narrationText(step)
        return { key: narrationKey(step), text, pauses: NARRATION_PAUSES, hash: clipHash(text, NARRATION_PAUSES) }
    })
}
