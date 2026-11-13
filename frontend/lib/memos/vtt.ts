/**
 * A WebVTT transcript (what Zoom, Teams and Meet export) as plain "Speaker: text" lines, for an
 * internal memo (.claude/plans/brio-features-round-2.md, §8).
 *
 * What goes: the WEBVTT header and its metadata lines, NOTE, STYLE and REGION blocks, cue numbers and
 * identifiers, timestamps and cue settings, and every tag (`<c>`, `<i>`, karaoke times). What stays:
 * who spoke, from a `<v Name>` voice tag (Teams, Meet) or a "Name:" prefix (Zoom), and what they said,
 * with entities decoded. Consecutive cues by the same speaker become one turn, and turns are separated
 * by a blank line so the Markdown file reads as paragraphs.
 *
 * Pure and browser-safe: the Add memo sheet runs it on the attached file before anything is sent.
 */

export interface ParsedTranscript {
    text: string
    /** From the start to the end of the last cue, rounded to whole minutes (at least 1); null with no timed cue. */
    durationMinutes: number | null
    /** Distinct speakers named in the transcript. */
    speakers: number
}

/** "00:01:02.500 --> 00:01:05.000 align:start", hours optional, comma or dot before the milliseconds. */
const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/

/** A `<v Name>` or `<v.class Name>` voice tag; the name is everything up to the `>`. */
const VOICE = /<v(?:\.[^\s>]+)?\s+([^>]+?)\s*>/i

/**
 * A "Name: text" prefix, as Zoom writes it: a short name of up to four words that starts with a letter.
 * A clock time ("10:30") or a sentence with a colon in its middle doesn't match.
 */
const PREFIX = /^([A-Za-zÀ-ɏ][\wÀ-ɏ.'’-]*(?: [\wÀ-ɏ.'’-]+){0,3}):\s+(\S[\s\S]*)$/

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '',
}

/** HTML entities as WebVTT allows them: the named ones it defines, and numeric ones. Unknown ones stay as written. */
export function decodeEntities(s: string): string {
    return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, entity: string) => {
        if (entity[0] === '#') {
            const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? whole
    })
}

/** A cue timestamp in seconds. */
export function vttSeconds(stamp: string): number {
    const [clock, fraction = '0'] = stamp.trim().replace(',', '.').split('.')
    const seconds = clock.split(':').reduce((total, part) => total * 60 + Number(part), 0)
    return seconds + Number(`0.${fraction}`)
}

const isHeaderBlock = (line: string) => /^﻿?WEBVTT(?:[ \t].*)?$/.test(line.trim())
const isSkippedBlock = (line: string) => /^(NOTE|STYLE|REGION)(?:[ \t].*)?$/.test(line.trim())

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

interface Turn {
    speaker: string | null
    text: string
}

/** The transcript in a .vtt file, as plain text. A file with no timed cue is kept as written, minus its header. */
export function parseVtt(input: string): ParsedTranscript {
    const normalized = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    const blocks = normalized.split(/\n[ \t]*\n/)
    const turns: Turn[] = []
    const speakers = new Map<string, string>()
    let lastEnd = 0
    let cues = 0

    blocks.forEach((block, index) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '')
        if (lines.length === 0) return
        if (index === 0 && isHeaderBlock(lines[0])) return
        if (isSkippedBlock(lines[0])) return

        const at = lines.findIndex((l) => TIMING.test(l))
        if (at < 0) return
        cues += 1
        const timing = TIMING.exec(lines[at])!
        lastEnd = Math.max(lastEnd, vttSeconds(timing[2]))

        const payload = lines.slice(at + 1).join(' ')
        const voice = VOICE.exec(payload)?.[1]
        let text = squash(decodeEntities(payload.replace(/<[^>]*>/g, ' ')))
        let speaker: string | null = voice ? squash(decodeEntities(voice)) : null
        if (!speaker) {
            const prefixed = PREFIX.exec(text)
            if (prefixed) {
                speaker = prefixed[1]
                text = prefixed[2].trim()
            }
        }
        if (!text) return

        if (speaker) {
            // One spelling per person: the first one seen.
            const key = speaker.toLowerCase()
            if (!speakers.has(key)) speakers.set(key, speaker)
            speaker = speakers.get(key)!
        }

        const last = turns[turns.length - 1]
        if (last && last.speaker === speaker) last.text = `${last.text} ${text}`
        else turns.push({ speaker, text })
    })

    if (cues === 0) {
        // Not a transcript after all: keep what was written rather than nothing.
        const lines = normalized.split('\n')
        if (lines.length > 0 && isHeaderBlock(lines[0])) lines.shift()
        return { text: lines.join('\n').trim(), durationMinutes: null, speakers: 0 }
    }

    return {
        text: turns.map((t) => (t.speaker ? `${t.speaker}: ${t.text}` : t.text)).join('\n\n'),
        durationMinutes: lastEnd > 0 ? Math.max(1, Math.round(lastEnd / 60)) : null,
        speakers: speakers.size,
    }
}
