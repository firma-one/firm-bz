import { describe, expect, it } from 'vitest'
import { attachAllToast } from './attach-all-toast'

describe('Attach all counts what really attached (CN-5)', () => {
    it('says how many of how many, and which did not attach and why', () => {
        expect(attachAllToast([
            { name: 'Acme', outcome: { attached: true } },
            { name: 'Beta', outcome: { attached: false, reason: "You don't have permission to change this client's storage." } },
            { name: 'Core', outcome: { attached: true } },
        ])).toEqual({
            type: 'warning',
            title: 'Attached with problems',
            message: "Attached 2 of 3. Not attached: Beta · You don't have permission to change this client's storage.",
        })
    })

    it('is an error when nothing attached, never "Attached"', () => {
        const toast = attachAllToast([
            { name: 'Acme', outcome: { attached: false, reason: 'Something went wrong on our side. Try again.' } },
            { name: 'Beta', outcome: { attached: false, reason: 'This client was deleted. Refresh the page.' } },
        ])
        expect(toast.type).toBe('error')
        expect(toast.message).toBe('None of the 2 clients attached. Acme · Something went wrong on our side. Try again.; Beta · This client was deleted. Refresh the page.')
    })

    it('passes on a folder that could not be set up, with its ticket', () => {
        const toast = attachAllToast([
            { name: 'Acme', outcome: { attached: true, warning: "Attached, but its folder in Google Drive couldn't be set up. Support ticket #42 filed." } },
            { name: 'Beta', outcome: { attached: true } },
        ])
        expect(toast).toEqual({
            type: 'warning',
            title: 'Attached with a problem',
            message: "Attached 2 clients. Acme: Attached, but its folder in Google Drive couldn't be set up. Support ticket #42 filed.",
        })
    })

    it('is a plain success when every one attached cleanly', () => {
        expect(attachAllToast([{ name: 'Acme', outcome: { attached: true } }])).toEqual({ type: 'success', title: 'Attached', message: 'Attached 1 client to this connector.' })
    })
})
