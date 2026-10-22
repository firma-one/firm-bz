import { describe, expect, it } from 'vitest'
import { byEmail, creatorOf, type Person } from './file-creator'

const neha: Person = { email: 'neha@firm.com', name: 'Neha Rao', avatarUrl: 'https://a/neha.png' }
const deepak: Person = { email: 'deepak@firm.com', name: 'Deepak Firma', avatarUrl: null }
const people = new Map<string, Person>([['u-neha', neha], ['u-deepak', deepak]])
const members = byEmail(people)
// What Drive says of anything the app added: the connector account owns it
const connectorAccount = { displayName: 'Deepak Shettigar', emailAddress: 'Deepak@Firm.com', photoLink: 'https://drive/ds.png' }

describe('creatorOf', () => {
    it('names the member who added it through the app, not the Drive owner', () => {
        expect(creatorOf('u-neha', connectorAccount, people, members)).toEqual({
            displayName: 'Neha Rao', emailAddress: 'neha@firm.com', photoLink: 'https://a/neha.png', viaDrive: false,
        })
    })

    it('falls back to the Drive owner for a file added in Drive, by their member name when on the engagement', () => {
        expect(creatorOf(null, connectorAccount, people, members)).toEqual({
            displayName: 'Deepak Firma', emailAddress: 'Deepak@Firm.com', photoLink: 'https://drive/ds.png', viaDrive: true,
        })
    })

    it('keeps the Drive name for an owner who is not on the engagement', () => {
        const outsider = { displayName: 'Sam Client', emailAddress: 'sam@client.com' }
        expect(creatorOf(null, outsider, people, members)).toMatchObject({ displayName: 'Sam Client', viaDrive: true })
    })

    it('falls back to Drive when the recorded member can no longer be found', () => {
        expect(creatorOf('u-gone', connectorAccount, people, members)).toMatchObject({ displayName: 'Deepak Firma', viaDrive: true })
    })

    it('is null with no member and no Drive owner (a shared drive, say)', () => {
        expect(creatorOf(null, null, people, members)).toBeNull()
        expect(creatorOf(null, { displayName: '', emailAddress: '' }, people, members)).toBeNull()
    })
})
