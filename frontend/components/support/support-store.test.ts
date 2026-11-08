import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The Support page's store keeps the routes' reasons, names each file that wasn't attached, and
 * never says "couldn't send" about a request that was filed (a retry would file it twice).
 */

const { submitErrorTicket, upload } = vi.hoisted(() => ({ submitErrorTicket: vi.fn(), upload: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }))
vi.mock('@/app/actions/submit-ticket', () => ({ submitErrorTicket }))
vi.mock('@/lib/support-attachment-upload', () => ({ uploadSupportAttachment: upload }))

import { SupportStore, liveSupportSource, describeFileFailures, type SupportSource } from './support-store'

const file = (name: string) => new File(['x'], name)
const meta = (name: string) => ({ attachmentId: name, originalName: name, storedName: name, mimeType: 'text/plain', size: 1, blobData: '' })

beforeEach(() => {
    submitErrorTicket.mockReset()
    upload.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('SupportStore.create', () => {
    it('a request filed before its files failed is reported as sent, with each file and why', async () => {
        const source: SupportSource = {
            load: async () => [],
            create: async () => 'TKT-9',
            addComment: vi.fn(),
            setStatus: vi.fn(),
            addFiles: async () => { throw new Error('Your session has expired. Sign in again.') },
            removeFile: vi.fn(),
        }
        const out = await new SupportStore(source).create({ kind: 'BUG', description: 'Broken' }, [file('a.png'), file('b.pdf')])
        expect(out.ticketNumber).toBe('TKT-9')
        expect(out.failedFiles).toEqual([
            { name: 'a.png', reason: 'Your session has expired. Sign in again.' },
            { name: 'b.pdf', reason: 'Your session has expired. Sign in again.' },
        ])
    })

    it('throws only when the request itself wasn’t filed', async () => {
        submitErrorTicket.mockResolvedValue({ success: false, message: 'Failed to submit ticket' })
        const store = new SupportStore(liveSupportSource('acme'))
        await expect(store.create({ kind: 'BUG', description: 'Broken' }, [])).rejects.toThrow(/wasn't saved on our side/)
    })
})

describe('liveSupportSource', () => {
    it('keeps the route’s reason for a refused reply', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: "You don't have access to this request." }), { status: 403 })))
        await expect(liveSupportSource('acme').addComment('TKT-1', 'hi')).rejects.toThrow("You don't have access to this request.")
    })

    it('a load that never left says Firma couldn’t be reached', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const store = new SupportStore(liveSupportSource('acme'))
        await store.load()
        expect(store.getSnapshot().error).toMatch(/^Couldn't reach/)
    })

    it('names each file that wasn’t attached, with the upload’s own reason', async () => {
        upload.mockImplementation(async (_t: string, _n: string, f: File) => (
            f.name === 'big.mov' ? { success: false, error: 'Too large · files can be up to 8 MB.' } : { success: true, meta: meta(f.name) }
        ))
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })))
        const out = await liveSupportSource('acme').addFiles('TKT-1', [file('ok.png'), file('big.mov')])
        expect(out.attached.map((a) => a.originalName)).toEqual(['ok.png'])
        expect(describeFileFailures(out.failed)).toBe('big.mov (Too large · files can be up to 8 MB.)')
    })

    it('uploaded but not saved to the request counts as not attached, with the save’s reason', async () => {
        upload.mockImplementation(async (_t: string, _n: string, f: File) => ({ success: true, meta: meta(f.name) }))
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This request no longer exists.' }), { status: 404 })))
        const out = await liveSupportSource('acme').addFiles('TKT-1', [file('ok.png')])
        expect(out.attached).toEqual([])
        expect(out.failed).toEqual([{ name: 'ok.png', reason: 'This request no longer exists.' }])
    })
})
