import { describe, it, expect } from 'vitest'
import { buildVault, type KnownEntity } from './pseudonymize'

/**
 * Placeholders before Brio reads anything (§14 item 5): what's replaced, what isn't, and that every
 * placeholder comes back as the words it stood for. Pure string work; nothing is sent anywhere.
 */

const ENTITIES: KnownEntity[] = [
    { kind: 'person', id: 'user-dana', name: 'Dana Whitfield' },
    { kind: 'person', id: 'user-alex-j', name: 'Alex Jordan' },
    { kind: 'person', id: 'user-alex-r', name: 'Alex Rivera' },
    { kind: 'person', id: 'user-may', name: 'May Chen' },
    { kind: 'client', id: 'client-acme', name: 'Acme Robotics, Inc.' },
    { kind: 'firm', id: 'firm-beacon', name: 'Beacon Growth Partners' },
]

const vault = buildVault(ENTITIES)
const DANA = vault.tokenOf('person', 'user-dana')!
const MAY = vault.tokenOf('person', 'user-may')!
const ACME = vault.tokenOf('client', 'client-acme')!
const BEACON = vault.tokenOf('firm', 'firm-beacon')!
const first = (t: string) => t.replace(/\]$/, '_FIRST]')
const last = (t: string) => t.replace(/\]$/, '_LAST]')

describe('names', () => {
    it('a person\'s placeholder comes from their record, not their name or who else is there', () => {
        // Eight hex digits, the norm.
        expect(DANA).toMatch(/^\[PERSON_[0-9A-F]{8}\]$/)
        expect(ACME).toMatch(/^\[CLIENT_[0-9A-F]{8}\]$/)
        // Someone joining, someone leaving, a different engagement: Dana is the same placeholder.
        const elsewhere = buildVault([{ kind: 'person', id: 'user-zoe', name: 'Aaron Abbott' }, ENTITIES[0]])
        expect(elsewhere.tokenOf('person', 'user-dana')).toBe(DANA)
        expect(buildVault([...ENTITIES].reverse()).tokenOf('person', 'user-dana')).toBe(DANA)
    })

    it('should two codes ever clash, the earlier id keeps its code, the later takes more digits, and every request agrees', () => {
        // One hex digit makes clashes certain: 20 people, 16 codes.
        const people: KnownEntity[] = Array.from({ length: 20 }, (_, i) => ({ kind: 'person', id: `user-${String(i).padStart(2, '0')}`, name: `Person Number${i}` }))
        const tiny = buildVault(people, { codeLength: 1 })
        const tokens = people.map((p) => tiny.tokenOf('person', p.id)!)
        expect(new Set(tokens).size).toBe(20)
        expect(tokens[0]).toMatch(/^\[PERSON_[0-9A-F]\]$/)
        expect(tokens.some((t) => /^\[PERSON_[0-9A-F]{3,}\]$/.test(t))).toBe(true)
        // Built again in another order, or with someone later added, the same people keep the same codes.
        expect(people.map((p) => buildVault([...people].reverse(), { codeLength: 1 }).tokenOf('person', p.id))).toEqual(tokens)
        const later = buildVault([...people, { kind: 'person', id: 'user-99', name: 'Later Joiner' }], { codeLength: 1 })
        expect(people.map((p) => later.tokenOf('person', p.id))).toEqual(tokens)
        // And every placeholder still comes back as its own person.
        const s = tiny.session()
        expect(s.unmask(s.mask('Person Number7 and Person Number13'))).toBe('Person Number7 and Person Number13')
    })

    it('replaces people, the client and the firm, and puts them back exactly', () => {
        const s = vault.session()
        const text = 'Dana Whitfield of Acme Robotics asked Beacon Growth Partners for the K-1s; Dana will send them.'
        const masked = s.mask(text)
        expect(masked).toBe(`${DANA} of ${ACME} asked ${BEACON} for the K-1s; ${first(DANA)} will send them.`)
        expect(masked).not.toMatch(/Dana|Acme|Beacon/)
        expect(s.unmask(masked)).toBe(text)
    })

    it('a first name two people share gets one placeholder for both; a last name, its own', () => {
        const s = vault.session()
        expect(s.mask('Alex said Whitfield agreed')).toBe(`[NAME_1] said ${last(DANA)} agreed`)
        expect(s.unmask(`[NAME_1] said ${last(DANA)} agreed`)).toBe('Alex said Whitfield agreed')
    })

    it('leaves a name inside another word alone, and a first name that is an everyday word', () => {
        expect(vault.session().mask('Danaher Corp. may call; May Chen will not')).toBe(`Danaher Corp. may call; ${MAY} will not`)
    })

    it('reads a name however it is typed, and possessives keep their \'s', () => {
        const s = vault.session()
        expect(s.mask("what's dana waiting on? acme robotics' K-1")).toBe(`what's ${first(DANA)} waiting on? ${ACME}' K-1`)
        expect(s.unmask(`${first(DANA)}'s figures`)).toBe("dana's figures")
        // A model that writes the placeholder in lower case still gets the words back.
        expect(s.unmask(first(DANA).toLowerCase())).toBe('dana')
    })

    it('a name written two ways comes back each as it was written: quotes must match the notes exactly', () => {
        const s = vault.session()
        const text = 'Dana sent it. later: chased dana again. Acme Robotics, Inc. and Acme Robotics agreed.'
        const masked = s.mask(text)
        expect(masked).toBe(`${first(DANA)} sent it. later: chased ${first(DANA).replace(/\]$/, '_V2]')} again. ${ACME}, Inc. and ${ACME} agreed.`)
        expect(s.unmask(masked)).toBe(text)
    })

    it('a placeholder the session never gave out is left as it is', () => {
        expect(vault.session().unmask('Ask [PERSON_FFFF] about [EMAIL_4]')).toBe('Ask [PERSON_FFFF] about [EMAIL_4]')
    })
})

describe('patterns', () => {
    const s = () => buildVault([]).session()

    it('emails and links, numbered as they first appear, the same value the same placeholder', () => {
        const session = s()
        const text = 'Write to dana@acme.com or see https://acme.sharepoint.com/sites/tax/Shared%20Documents/K1.pdf. Again: dana@acme.com'
        const masked = session.mask(text)
        expect(masked).toBe('Write to [EMAIL_1] or see [LINK_1]. Again: [EMAIL_1]')
        expect(session.unmask(masked)).toBe(text)
    })

    it('phone numbers written as phone numbers; never a date, an amount or a bare run of digits', () => {
        const session = s()
        expect(session.mask('Call (415) 555-0134 or +44 20 7946 0958.')).toBe('Call [PHONE_1] or [PHONE_2].')
        expect(session.mask('Due 2026-11-14, $1,250,000, order 4155550134, version 2.3.1')).toBe('Due 2026-11-14, $1,250,000, order 4155550134, version 2.3.1')
    })

    it('SSN, ITIN and EIN; a card number only when its own check holds', () => {
        const session = s()
        expect(session.mask('SSN 123-45-6789, ITIN 912-70-1234, EIN 12-3456789')).toBe('SSN [ID_1], ITIN [ID_2], EIN [ID_3]')
        expect(session.mask('Card 4111 1111 1111 1111')).toBe('Card [CARD_1]')
        expect(session.mask('Ref 4111 1111 1111 1112')).toBe('Ref 4111 1111 1111 1112')
    })

    it('an IBAN', () => {
        expect(s().mask('Pay GB82 WEST 1234 5698 7654 32 by Friday')).toBe('Pay [IBAN_1] by Friday')
    })

    it('a name inside an email is part of the email', () => {
        expect(vault.session().mask('dana@acme.com')).toBe('[EMAIL_1]')
    })
})

describe('deep and streamed', () => {
    it('masks and unmasks every string in a tool call\'s input, at any depth', () => {
        const session = vault.session()
        const input = { reminders: [{ title: 'Chase Dana Whitfield', quote: 'Dana: I\'ll send it to alex@beacon.com', date: '2026-11-20' }], count: 1 }
        const masked = session.maskDeep(input)
        expect(masked.reminders[0]).toEqual({ title: `Chase ${DANA}`, quote: `${first(DANA)}: I'll send it to [EMAIL_1]`, date: '2026-11-20' })
        expect(session.unmaskDeep(masked)).toEqual(input)
    })

    it('a placeholder split across streamed pieces comes back whole', () => {
        const session = vault.session()
        session.mask('Dana Whitfield, Dana')
        const out = session.streamUnmasker()
        const whole = `Ask ${DANA} about the K-1s; ${first(DANA)} said Friday. [x] and a lone [`
        // Cut it into pieces that split both placeholders.
        const cuts = [6, DANA.length + 4, DANA.length + 22, DANA.length + 30, whole.length - 3]
        const pieces = cuts.map((c, i) => whole.slice(i === 0 ? 0 : cuts[i - 1], c)).concat(whole.slice(cuts[cuts.length - 1]))
        const text = pieces.map((p) => out.push(p)).join('') + out.flush()
        expect(text).toBe('Ask Dana Whitfield about the K-1s; Dana said Friday. [x] and a lone [')
    })

    it('a bracket that never closes isn\'t held for long', () => {
        const out = buildVault([]).session().streamUnmasker()
        expect(out.push('[note: ')).toBe('')
        expect(out.push('this is a long aside that runs on')).toBe('[note: this is a long aside that runs on')
    })
})
