import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { actions } = vi.hoisted(() => ({
    actions: {
        getCustomDomainState: vi.fn(),
        checkCustomDomainName: vi.fn(),
        requestCustomDomain: vi.fn(),
        cancelCustomDomainRequest: vi.fn(),
        removeCustomDomain: vi.fn(),
    },
}))
vi.mock('@/lib/actions/custom-domains', () => actions)

import { ToastProvider } from '@/components/ui/toast'
import { CustomDomainSection } from './custom-domain-section'

const base = {
    canManage: true as const,
    groupId: 'g1',
    groupName: 'Acme',
    live: null,
    lastRejected: null,
    plan: 'Pro',
    allowed: { SUBDOMAIN: true, CUSTOM: false },
    lowestPlan: { SUBDOMAIN: 'Pro', CUSTOM: 'Enterprise' },
}
const row = (over: Record<string, unknown>) => ({
    id: 'd1', host: 'acme.firma.bz', kind: 'SUBDOMAIN', status: 'REQUESTED', reachable: true, lastCheckedAt: null, lastCheckError: null,
    requestedAt: '2026-11-13T10:00:00Z', reviewedAt: null, reviewNote: null, requestedByName: 'Morgan Ellis', ...over,
})

function show() {
    return render(<ToastProvider><CustomDomainSection firmId="f1" /></ToastProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('Billing · Custom domain', () => {
    it('shows nothing to anyone but the Group admin', async () => {
        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: { canManage: false } })
        const { container } = show()
        await waitFor(() => expect(actions.getCustomDomainState).toHaveBeenCalledWith('f1'))
        expect(container.textContent).toBe('')
    })

    it('a plan without it points to /pricing', async () => {
        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: { ...base, plan: 'Standard', allowed: { SUBDOMAIN: false, CUSTOM: false } } })
        show()
        expect(await screen.findByText(/Available on Pro and up\. Your own domain is on Enterprise\./)).toBeTruthy()
        expect(screen.getByRole('link', { name: 'See plans' }).getAttribute('href')).toBe('/pricing')
    })

    it('checks a name as it is typed, then requests it', async () => {
        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: base })
        actions.checkCustomDomainName.mockResolvedValue({ ok: true, data: { ok: true, host: 'acme.firma.bz' } })
        actions.requestCustomDomain.mockResolvedValue({ ok: true, data: row({}) })
        show()
        const own = await screen.findByRole('radio', { name: /Your own domain/ })
        expect((own as HTMLButtonElement).disabled).toBe(true)
        fireEvent.change(screen.getByLabelText('Subdomain'), { target: { value: 'acme' } })
        expect(await screen.findByText('acme.firma.bz is available')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Request acme.firma.bz' }))
        await waitFor(() => expect(actions.requestCustomDomain).toHaveBeenCalledWith('f1', 'SUBDOMAIN', 'acme'))
    })

    it('says why a name can\'t be used, and holds Request back', async () => {
        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: base })
        actions.checkCustomDomainName.mockResolvedValue({ ok: true, data: { ok: false, reason: 'format', message: 'Already in use · try another' } })
        show()
        fireEvent.change(await screen.findByLabelText('Subdomain'), { target: { value: 'datasentry' } })
        expect(await screen.findByText('Already in use · try another')).toBeTruthy()
        expect((screen.getByRole('button', { name: 'Request' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('waiting, live and unreachable', async () => {
        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: { ...base, live: row({}) } })
        const first = show()
        expect(await screen.findByText('Waiting for approval')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
        first.unmount()

        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: { ...base, live: row({ status: 'APPROVED', reviewedAt: '2026-11-14T10:00:00Z' }) } })
        const second = show()
        expect(await screen.findByText('Live')).toBeTruthy()
        expect(screen.getByRole('link', { name: /acme\.firma\.bz/ }).getAttribute('href')).toBe('https://acme.firma.bz/')
        second.unmount()

        actions.getCustomDomainState.mockResolvedValue({ ok: true, data: { ...base, live: row({ status: 'APPROVED', reachable: false, lastCheckedAt: '2026-11-20T03:00:00Z', lastCheckError: 'doesn\'t resolve' }) } })
        show()
        expect(await screen.findByText('Unreachable')).toBeTruthy()
        expect(screen.getByText(/people use www\.firma\.bz/)).toBeTruthy()
    })
})
