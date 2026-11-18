import { describe, it, expect, vi } from 'vitest'
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

describe('the report PDF size check (Vercel caps a request at 4.5 MB)', () => {
    it('lets a typical report through and stops one that would not fit', async () => {
        const { reportPdfTooLarge, reportPdfTooLargeText, MAX_ATTACHMENT_REQUEST_BYTES } = await import('@/lib/updates/update-send')
        expect(reportPdfTooLarge('A'.repeat(2_000_000))).toBe(false)
        const big = 'A'.repeat(MAX_ATTACHMENT_REQUEST_BYTES + 1)
        expect(reportPdfTooLarge(big)).toBe(true)
        expect(reportPdfTooLargeText(big)).toBe('The Overview report is too large to attach (3.3 MB; the limit is 3.3 MB). Send it without the PDF.')
        expect(reportPdfTooLargeText(4_100_000, '')).toBe('The Overview report is too large to attach (4.1 MB; the limit is 3.3 MB).')
    })

    it('sends nothing when the PDF is too large, and says why', async () => {
        const { sendPublishedUpdate } = await import('./update-email-fields')
        const { MAX_ATTACHMENT_REQUEST_BYTES } = await import('@/lib/updates/update-send')
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
        const state = { chosenIds: ['dana'], emails: [], note: '', count: 1 } as unknown as Parameters<typeof sendPublishedUpdate>[1]
        await expect(sendPublishedUpdate('p1', state, 'A'.repeat(MAX_ATTACHMENT_REQUEST_BYTES + 10))).rejects.toThrow(/too large to attach/)
        expect(fetchSpy).not.toHaveBeenCalled()
        vi.unstubAllGlobals()
    })

    it('passes on whether the sender got their copy', async () => {
        const { sendPublishedUpdate } = await import('./update-email-fields')
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sent: 1, total: 1, failed: [], copied: true }), { status: 200 })))
        const state = { chosenIds: ['dana'], emails: [], note: '', count: 1 } as unknown as Parameters<typeof sendPublishedUpdate>[1]
        expect(await sendPublishedUpdate('p1', state)).toEqual({ sent: 1, total: 1, failed: [], copied: true })
        vi.unstubAllGlobals()
    })
})
