import { describe, it, expect } from 'vitest'
import { resolveNames, resolveDisplayName, humanizeEmailLocalPart, needsName } from './display-name'

describe('resolveNames', () => {
    it('prefers the typed pair over whatever the OAuth provider sent', () => {
        // The bug this module exists for: Microsoft overwrites full_name on every sign-in.
        const meta = {
            first_name: 'Deepak',
            last_name: 'Firmaone',
            full_name: 'Deepak Shettigar',
            name: 'Deepak Shettigar',
        }
        expect(resolveNames(meta, 'deepak@firmaone.com')).toMatchObject({
            firstName: 'Deepak',
            lastName: 'Firmaone',
            displayName: 'Deepak Firmaone',
            authored: true,
            source: 'user',
        })
    })

    it('reports an invite-seeded pair as such so the user still outranks it later', () => {
        const meta = { first_name: 'Sam', last_name: 'Reed', name_source: 'invite' }
        expect(resolveNames(meta).source).toBe('invite')
    })

    it('falls back to the provider name, keeping the remainder as the surname', () => {
        const meta = { full_name: 'Mary Jane Watson' }
        expect(resolveNames(meta)).toMatchObject({
            firstName: 'Mary',
            lastName: 'Jane Watson',
            authored: true,
            source: 'provider',
        })
    })

    it('derives a name from the email when nothing else is known', () => {
        expect(resolveNames({}, 'deepak.s.shettigar@acme.com')).toMatchObject({
            firstName: 'Deepak',
            lastName: 'S Shettigar',
            displayName: 'Deepak S Shettigar',
            authored: false,
            source: 'derived',
        })
    })

    it('treats a half-filled pair as authored rather than dropping to the email', () => {
        expect(resolveNames({ first_name: 'Cher' }, 'cher@acme.com')).toMatchObject({
            firstName: 'Cher',
            lastName: null,
            displayName: 'Cher',
            source: 'user',
        })
    })

    it('ignores blank metadata strings', () => {
        expect(resolveNames({ first_name: '  ', full_name: '' }, 'jo@acme.com').source).toBe('derived')
    })

    it('returns an empty result when there is no metadata and no email', () => {
        expect(resolveNames(null)).toMatchObject({
            firstName: null,
            lastName: null,
            displayName: '',
            authored: false,
            source: 'none',
        })
    })
})

describe('humanizeEmailLocalPart', () => {
    it.each([
        ['deepak.s.shettigar', 'Deepak S Shettigar'],
        ['john_smith', 'John Smith'],
        ['no-reply', 'No Reply'],
        ['jsmith123', 'Jsmith'],
        ['sam+firma', 'Sam'],
        ['info', 'Info'],
    ])('%s -> %s', (input, expected) => {
        expect(humanizeEmailLocalPart(input)).toBe(expected)
    })

    it('leaves a token that is only digits alone rather than erasing it', () => {
        expect(humanizeEmailLocalPart('12345')).toBe('12345')
    })
})

describe('needsName', () => {
    it('is true only while the name is a guess', () => {
        expect(needsName({})).toBe(true)
        expect(needsName({ full_name: 'Sam Reed' })).toBe(false)
        expect(needsName({ first_name: 'Sam' })).toBe(false)
    })
})

describe('resolveDisplayName', () => {
    it('is the joined pair', () => {
        expect(resolveDisplayName({ first_name: 'Sam', last_name: 'Reed' })).toBe('Sam Reed')
    })
})
