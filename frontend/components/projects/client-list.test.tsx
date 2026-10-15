import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClientSummary } from '@/lib/actions/hierarchy'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/lib/use-branding', () => ({ useBranding: () => null }))

import { ClientList } from './client-list'

function client(overrides: Partial<ClientSummary>): ClientSummary {
    return {
        id: 'c1', name: 'Contoso', slug: 'contoso', industry: null, sector: null, status: 'ACTIVE', website: null,
        description: null, tags: [], ownerId: null, followUpDate: null, expectedCloseDate: null, leadSource: null,
        internalMemo: null, relationshipValue: null, clientSinceDate: null, linkedInUrl: null, companySizeBracket: null,
        billingAddress: null, connectorId: null, connectorEmail: null, connectorStatus: null, connectorType: null,
        brandPrimaryColor: null, brandLogoUrl: null, createdAt: new Date(), updatedAt: new Date(), engagements: [],
        ...overrides,
    }
}

const today = new Date()
const clients = [
    client({ id: 'c1', name: 'Contoso', slug: 'contoso', industry: 'Retail', engagements: [{ id: 'e1' }, { id: 'e2' }], followUpDate: today }),
    client({ id: 'c2', name: 'Fabrikam', slug: 'fabrikam', status: 'PROSPECT' }),
]

beforeEach(() => vi.clearAllMocks())

describe('ClientList', () => {
    it('lists clients as a table by default, with status, industry and engagement count', () => {
        render(<ClientList clients={clients} groupSlug="g" orgSlug="acme" />)
        expect(screen.getByRole('table')).toBeTruthy()
        expect(screen.getByRole('link', { name: /Contoso/ }).getAttribute('href')).toBe('/d/g/f/acme/c/contoso')
        expect(screen.getByText('Retail')).toBeTruthy()
        expect(screen.getByText('2')).toBeTruthy()
        expect(screen.getByText('Prospect')).toBeTruthy()
    })

    it('shows a follow-up tag only when one is due within two days', () => {
        render(<ClientList clients={clients} groupSlug="g" orgSlug="acme" />)
        expect(screen.getByText('Follow up today')).toBeTruthy()
        expect(screen.getAllByText(/Follow/)).toHaveLength(1)
    })

    it('opens the client when its row is clicked', () => {
        render(<ClientList clients={clients} groupSlug="g" orgSlug="acme" />)
        fireEvent.click(screen.getByText('Fabrikam').closest('tr')!)
        expect(push).toHaveBeenCalledWith('/d/g/f/acme/c/fabrikam')
    })

    it('renders gallery cards that link to each client', () => {
        render(<ClientList clients={clients} groupSlug="g" orgSlug="acme" viewMode="grid" />)
        expect(screen.queryByRole('table')).toBeNull()
        expect(screen.getByText('2 engagements')).toBeTruthy()
        expect(screen.getByText('0 engagements')).toBeTruthy()
        expect(screen.getByRole('link', { name: /Fabrikam/ }).getAttribute('href')).toBe('/d/g/f/acme/c/fabrikam')
    })

    it('says so when there are no clients', () => {
        render(<ClientList clients={[]} groupSlug="g" orgSlug="acme" />)
        expect(screen.getByText('No clients yet')).toBeTruthy()
    })
})
