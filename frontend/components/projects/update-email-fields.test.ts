import { describe, it, expect } from 'vitest'
import { suggestionFor } from './update-email-fields'

/**
 * The To field's suggestion row (.claude/plans/publish-and-send-update.md): what typing an address
 * would do, said before Enter, so an add never looks like it did nothing.
 */

const PEOPLE = [
    { userId: 'dana', name: 'Dana Whitfield', role: 'Reviewer', email: 'dana@client.com' },
    { userId: 'sam', name: 'Sam Patel', role: 'Contributor · Full Access', email: 'sam@firm.co' },
]

describe('suggestionFor', () => {
    it('offers an address that is not on the engagement, saying so', () => {
        expect(suggestionFor('Jordan.Lee@AcmeRobotics.com ', PEOPLE, ['dana', 'sam'], []))
            .toEqual({ kind: 'add', label: 'jordan.lee@acmerobotics.com', detail: 'not on this engagement' })
    })

    it('names the person an address belongs to, and says when they are already in To', () => {
        expect(suggestionFor('dana@client.com', PEOPLE, ['dana', 'sam'], []))
            .toEqual({ kind: 'already', label: 'Dana Whitfield · Reviewer is already in To' })
        expect(suggestionFor('dana@client.com', PEOPLE, ['sam'], []))
            .toEqual({ kind: 'add', label: 'Dana Whitfield', detail: 'Reviewer' })
    })

    it('says when an address was added already', () => {
        expect(suggestionFor('jo@acme.com', PEOPLE, [], ['jo@acme.com']))
            .toEqual({ kind: 'already', label: 'jo@acme.com is already in To' })
    })

    it('says the sender is in Cc when they type their own address', () => {
        expect(suggestionFor('Priya@Firm.co', PEOPLE, [], [], 'priya@firm.co'))
            .toEqual({ kind: 'already', label: "That's you: you're in Cc and always get a copy" })
    })

    it('asks for the rest of an address still being typed', () => {
        expect(suggestionFor('jordan@acme', PEOPLE, [], [])).toEqual({ kind: 'typing', label: 'Keep typing an email address' })
    })

    it('shows nothing for an empty field or several addresses at once', () => {
        expect(suggestionFor('  ', PEOPLE, [], [])).toBeNull()
        expect(suggestionFor('a@x.com, b@y.com', PEOPLE, [], [])).toBeNull()
    })
})
