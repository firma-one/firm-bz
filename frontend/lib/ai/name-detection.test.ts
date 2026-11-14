import { describe, it, expect } from 'vitest'
import { detectNames, nameParts } from './name-detection'
import { buildVault } from './pseudonymize'

/**
 * Names we don't know (§14 item 5, Layer 3): found from how text is written, masked like the names we know.
 * Pure string work; nothing is sent anywhere.
 */

const found = (text: string) => detectNames(text).sort()

describe('detectNames', () => {
    it('a transcript\'s speakers, bold or not; a one-word speaker only when they speak more than once', () => {
        const transcript = 'Raj Patel: Thanks for making time.\n**Lena:** Sure.\nRaj Patel: The rate card is final.\nLena: Good.'
        expect(found(transcript)).toEqual(['Lena', 'Raj Patel'])
        // A note's topic labels aren't speakers.
        expect(found('Pricing: finance confirmed the rate card.\nTimeline: two weeks.\nDecision: go.')).toEqual([])
    })

    it('titles, greetings and sign-offs', () => {
        expect(found('Dr. Okafor will review it. Ms Lee agreed.')).toEqual(['Lee', 'Okafor'])
        expect(found('Hi Priya,\nSee attached.\nThanks, Marco Rossi.')).toEqual(['Marco Rossi', 'Priya'])
    })

    it('who did what: a name beside "said", "asked", "spoke with", "from", "cc"', () => {
        expect(found('Spoke with Raj Patel at the bank. Then Anjali said the K-1 is late. cc Tomás.'))
            .toEqual(['Anjali', 'Raj Patel', 'Tomás'])
        expect(found("Raj's team confirmed. Siobhan O'Brien asked for the deck.")).toEqual(["Siobhan O'Brien"])
    })

    it('never a day, a month, a team or a word that just starts a sentence', () => {
        expect(found('Finance confirmed the figures. Everyone agreed on Friday. The Board asked for more. By Monday, from Legal.')).toEqual([])
        expect(found('Pricing will change. Launch is in May. Move it to London.')).toEqual([])
        expect(found('Brio suggested two reminders.')).toEqual([])
    })

    it('a found name\'s first and last words are masked on their own too', () => {
        expect(nameParts('Raj Patel')).toEqual({ full: 'Raj Patel', first: 'Raj', last: 'Patel' })
        expect(nameParts('Lena')).toEqual({ full: 'Lena', first: null, last: null })
    })
})

describe('masking the names we don\'t know', () => {
    it('masks a found name everywhere in the request, and puts it back exactly', () => {
        const vault = buildVault([{ kind: 'person', id: 'u-dana', name: 'Dana Whitfield' }])
        const s = vault.session()
        const parts = ['You read notes for the engagement.', 'Spoke with Raj Patel at the bank. Dana Whitfield said Raj will send it; Patel agreed.']
        s.learnNames(parts)
        const masked = parts.map((p) => s.mask(p))
        expect(masked[1]).not.toMatch(/Raj|Patel|Dana/)
        expect(masked[1]).toContain('[NAME_1]')
        expect(masked[1]).toContain('[NAME_1_FIRST]')
        expect(masked[1]).toContain('[NAME_1_LAST]')
        expect(parts.map((p, i) => s.unmask(masked[i]))).toEqual(parts)
    })

    it('a name we know keeps its record\'s placeholder, not a found one', () => {
        const vault = buildVault([{ kind: 'person', id: 'u-dana', name: 'Dana Whitfield' }])
        const s = vault.session()
        s.learnNames(['Dana Whitfield said yes.'])
        expect(s.mask('Dana Whitfield said yes.')).toBe(`${vault.tokenOf('person', 'u-dana')} said yes.`)
    })

    it('found names are numbered after the vault\'s shared first names', () => {
        const vault = buildVault([
            { kind: 'person', id: 'u1', name: 'Alex Jordan' },
            { kind: 'person', id: 'u2', name: 'Alex Rivera' },
        ])
        const s = vault.session()
        s.learnNames(['Alex said Lena Fischer agreed.'])
        expect(s.mask('Alex said Lena Fischer agreed.')).toBe('[NAME_1] said [NAME_2] agreed.')
    })
})
