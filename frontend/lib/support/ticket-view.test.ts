import { describe, expect, it } from 'vitest'
import { browserFrom, inView, lastUpdate, splitDescription, toSupportTicket, wherePath } from './ticket-view'

const row = (over: Record<string, unknown> = {}) => ({
    ticketNumber: 'TKT-8F2K1Q', type: 'BUG', status: 'IN_PROGRESS',
    description: 'Drive upload fails for files over 100 MB\nIt stops at 99%.',
    createdAt: '2026-10-20T10:42:00.000Z', updatedAt: '2026-10-21T09:00:00.000Z',
    metadata: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
    errorDetails: {}, attachments: [], comments: [], userEmail: 'deepak@firm.com',
    firm: { name: 'FirmaOne', slug: 'firmaone' }, client: null, engagement: null,
    ...over,
})

describe('splitDescription', () => {
    it('takes the first line as the title and the rest as the body', () => {
        expect(splitDescription('\n  Title here \nLine two\nLine three')).toEqual({ title: 'Title here', body: 'Line two\nLine three' })
    })

    it('shortens a long first line, keeping it whole in the body', () => {
        const long = 'x'.repeat(130)
        const { title, body } = splitDescription(long)
        expect(title).toHaveLength(120)
        expect(title.endsWith('…')).toBe(true)
        expect(body).toBe(long)
    })

    it('names an empty request', () => {
        expect(splitDescription('   ').title).toBe('Untitled request')
    })
})

describe('browserFrom', () => {
    it.each([
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Chrome 141 on macOS'],
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'Edge 140 on Windows'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'Safari 18 on macOS'],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox 131 on Linux'],
    ])('reads %s', (ua, expected) => {
        expect(browserFrom(ua)).toBe(expected)
    })

    it('is null with nothing to read', () => {
        expect(browserFrom(undefined)).toBeNull()
        expect(browserFrom('curl/8.0')).toBeNull()
    })
})

describe('toSupportTicket', () => {
    it('reads a person’s request', () => {
        const t = toSupportTicket(row())
        expect(t).toMatchObject({ title: 'Drive upload fails for files over 100 MB', body: 'It stops at 99%.', kind: 'BUG', browser: 'Chrome 141 on macOS', auto: false })
        expect(t.raisedBy).toEqual({ name: 'deepak', email: 'deepak@firm.com' })
    })

    it('reads an automatic one: no person, and what failed', () => {
        const t = toSupportTicket(row({ metadata: { autoFiled: true }, errorDetails: { action: 'promoteToDeliverable', message: 'Drive returned 403' } }))
        expect(t.auto).toBe(true)
        expect(t.raisedBy).toBeNull()
        expect(t.failure).toEqual({ action: 'promoteToDeliverable', message: 'Drive returned 403' })
    })
})

describe('lastUpdate and views', () => {
    const comment = (fromFirma: boolean, authorEmail: string, createdAt: string, authorName: string | null = null) =>
        ({ id: createdAt, content: 'x', createdAt, authorEmail, authorName, fromFirma })

    it('says it is your turn when Firma spoke last on an open request', () => {
        const t = { ...toSupportTicket(row()), comments: [comment(true, 'help@firma.bz', '2026-10-22T08:00:00.000Z')] }
        expect(lastUpdate(t, 'deepak@firm.com')).toEqual({ who: 'Firma replied', at: '2026-10-22T08:00:00.000Z', yourTurn: true })
    })

    it('names you or a teammate, and says Raised or Filed with no conversation', () => {
        const base = toSupportTicket(row())
        expect(lastUpdate({ ...base, comments: [comment(false, 'Deepak@Firm.com', '2026-10-22T08:00:00.000Z')] }, 'deepak@firm.com').who).toBe('You')
        expect(lastUpdate({ ...base, comments: [comment(false, 'sam@firm.com', '2026-10-22T08:00:00.000Z', 'Sam Rivera')] }, 'deepak@firm.com').who).toBe('Sam')
        expect(lastUpdate(base, 'deepak@firm.com')).toMatchObject({ who: 'Raised', yourTurn: false })
        expect(lastUpdate({ ...base, auto: true }, null).who).toBe('Filed')
    })

    it('splits Open from Resolved', () => {
        expect(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => inView(s as any, 'open'))).toEqual([true, true, false, false])
        expect(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => inView(s as any, 'resolved'))).toEqual([false, false, true, true])
    })

    it('says where: client › engagement, or the firm', () => {
        expect(wherePath({ firm: { name: 'FirmaOne', slug: 'f' }, client: { name: 'DataSentry', slug: 'd' }, engagement: { name: 'Q2', slug: 'q' } })).toEqual(['DataSentry', 'Q2'])
        expect(wherePath({ firm: { name: 'FirmaOne', slug: 'f' }, client: null, engagement: null })).toEqual(['FirmaOne'])
    })
})

describe('lastUpdate from the Firma side', () => {
    const c = (fromFirma: boolean, authorEmail: string, authorName: string | null = null) =>
        ({ id: authorEmail, content: 'x', createdAt: '2026-10-22T08:00:00.000Z', authorEmail, authorName, fromFirma })

    it('is the team’s turn when the firm spoke last, or nobody has answered an open request', () => {
        const base = toSupportTicket(row())
        expect(lastUpdate({ ...base, comments: [c(false, 'deepak@firm.com', 'Deepak Shettigar')] }, 'staff@firma.bz', 'firma')).toMatchObject({ who: 'Deepak', yourTurn: true })
        expect(lastUpdate(base, 'staff@firma.bz', 'firma')).toMatchObject({ who: 'Raised', yourTurn: true })
        expect(lastUpdate({ ...base, status: 'RESOLVED' }, 'staff@firma.bz', 'firma').yourTurn).toBe(false)
    })

    it('names your own reply as You, and the team’s otherwise', () => {
        const base = toSupportTicket(row())
        expect(lastUpdate({ ...base, comments: [c(true, 'staff@firma.bz')] }, 'staff@firma.bz', 'firma')).toMatchObject({ who: 'You', yourTurn: false })
        expect(lastUpdate({ ...base, comments: [c(true, 'ops@firma.bz')] }, 'staff@firma.bz', 'firma')).toMatchObject({ who: 'Firma replied', yourTurn: false })
    })
})
