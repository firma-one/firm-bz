import { describe, it, expect } from 'vitest'
import { decodeEntities, parseVtt, vttSeconds } from './vtt'

/** What Teams and Meet export: voice tags, cue identifiers, a NOTE, a STYLE block. */
const TEAMS = `WEBVTT
Kind: captions
Language: en-US

NOTE
This transcript was generated automatically.

STYLE
::cue { color: white }

3f2a91c0-1/12-0
00:00:01.200 --> 00:00:04.800 align:start position:10%
<v Dana Whitfield>Thanks for joining. I&apos;ll send the K-1s</v>

3f2a91c0-1/13-0
00:00:04.800 --> 00:00:07.000
<v Dana Whitfield>by end of next week.</v>

3f2a91c0-1/14-0
00:00:07.500 --> 00:00:10.000
<v.loud Alex Jordan>Great. I need to chase the <b>brokerage</b> 1099-B &amp; the W-2.</v>

3f2a91c0-1/15-0
00:59:58.000 --> 01:01:31.400
<v dana whitfield>Talk soon.</v>
`

/** What Zoom exports: numbered cues, "Name:" prefixes, Windows line endings. */
const ZOOM = [
    'WEBVTT',
    '',
    '1',
    '00:00:00.000 --> 00:00:03.500',
    'Alex Jordan: Morning, everyone.',
    '',
    '2',
    '00:00:03.500 --> 00:00:06.000',
    'Alex Jordan: Quick one today.',
    '',
    '3',
    '00:00:06.000 --> 00:12:10.000',
    'Sam: Agreed, ten minutes.',
    '',
].join('\r\n')

describe('parseVtt', () => {
    it('drops the header, notes, styles, cue identifiers and timestamps, and keeps who said what', () => {
        const { text } = parseVtt(TEAMS)
        expect(text).not.toMatch(/WEBVTT|Kind:|NOTE|cue|-->|3f2a91c0|align:/)
        expect(text.split('\n\n')).toEqual([
            "Dana Whitfield: Thanks for joining. I'll send the K-1s by end of next week.",
            'Alex Jordan: Great. I need to chase the brokerage 1099-B & the W-2.',
            'Dana Whitfield: Talk soon.',
        ])
    })

    it('merges consecutive cues by the same speaker into one turn', () => {
        const { text } = parseVtt(ZOOM)
        expect(text).toBe('Alex Jordan: Morning, everyone. Quick one today.\n\nSam: Agreed, ten minutes.')
    })

    it('takes the speaker from a voice tag, or a "Name:" prefix when there is none', () => {
        expect(parseVtt(TEAMS).speakers).toBe(2)
        expect(parseVtt(ZOOM).speakers).toBe(2)
    })

    it('counts one person once, whatever the case of their name', () => {
        expect(parseVtt(TEAMS).text).not.toContain('dana whitfield')
    })

    it('measures the call from the last cue\'s end, in whole minutes', () => {
        expect(parseVtt(TEAMS).durationMinutes).toBe(62) // 01:01:31.400 is 61.5 minutes
        expect(parseVtt(ZOOM).durationMinutes).toBe(12) // 00:12:10.000
        expect(parseVtt('WEBVTT\n\n00:00.000 --> 00:10.000\nHi').durationMinutes).toBe(1)
    })

    it('does not take a clock time or a long sentence for a speaker', () => {
        const vtt = 'WEBVTT\n\n00:00.000 --> 00:05.000\n10:30: the meeting moved\n\n00:05.000 --> 00:09.000\nThe plan we discussed last week: still on'
        const parsed = parseVtt(vtt)
        expect(parsed.speakers).toBe(0)
        expect(parsed.text).toBe('10:30: the meeting moved The plan we discussed last week: still on')
    })

    it('keeps a file with no timed cue as written, minus its header', () => {
        expect(parseVtt('WEBVTT\nJust some notes\nOn two lines')).toEqual({ text: 'Just some notes\nOn two lines', durationMinutes: null, speakers: 0 })
    })

    it('reads SRT-style commas and a byte-order mark', () => {
        const parsed = parseVtt('﻿WEBVTT\n\n1\n00:00:01,000 --> 00:02:00,500\n<v Sam>Hello</v>')
        expect(parsed).toEqual({ text: 'Sam: Hello', durationMinutes: 2, speakers: 1 })
    })
})

describe('decodeEntities', () => {
    it('decodes the entities WebVTT allows, named and numeric, and leaves unknown ones', () => {
        expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &nbsp;f &lrm;g &bogus;')).toBe('a & b <c> "d" \'e\'  f g &bogus;')
    })
})

describe('vttSeconds', () => {
    it('reads hours, minutes, seconds and the fraction', () => {
        expect(vttSeconds('01:02:03.500')).toBe(3723.5)
        expect(vttSeconds('02:03.250')).toBe(123.25)
    })
})
