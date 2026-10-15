import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const { push, search } = vi.hoisted(() => ({ push: vi.fn(), search: { quickSearch: vi.fn(), getCommandRecents: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/actions/quick-search', () => search)
vi.mock('./workspace-switcher', () => ({ useSwitchFirm: () => ({ openFirm: vi.fn(), switching: null }) }))
let shell: any
vi.mock('./shell-data-context', () => ({ useShellData: () => shell }))

import { CommandMenu } from './command-menu'
import { useShellShortcuts } from './use-shell-shortcuts'

function Shortcuts() {
    useShellShortcuts({ onShowShortcuts: () => {} })
    return <input aria-label="typing here" />
}

beforeEach(() => {
    vi.clearAllMocks()
    shell = {
        firmSlug: 'acme', groupSlug: 'g', canManage: false,
        firms: [{ id: 'f1', name: 'Acme', slug: 'acme' }],
        data: { isExternalOnly: false },
    }
    search.getCommandRecents.mockResolvedValue([
        { id: 'r1', entityType: 'engagement', entityId: 'e1', path: '/d/g/f/acme/c/c1/e/fy26/files', title: 'FY26 Audit', context: 'Contoso', visitedAt: '2026-10-14T10:00:00Z' },
    ])
    search.quickSearch.mockResolvedValue([
        { id: 'client:c1', kind: 'client', title: 'Contoso', context: 'Client', href: '/d/g/f/acme/c/contoso' },
    ])
})

describe('CommandMenu', () => {
    it('opens on ⌘K with recents first, then navigation; admin items stay hidden for members', async () => {
        render(<CommandMenu onToggleSidebar={() => {}} onShowShortcuts={() => {}} />)
        fireEvent.keyDown(document, { key: 'k', metaKey: true })
        expect(await screen.findByText('FY26 Audit')).toBeTruthy()
        expect(screen.getByText('Inbox')).toBeTruthy()
        expect(screen.queryByText('Firm settings')).toBeNull()
        expect(search.getCommandRecents).toHaveBeenCalledWith('acme')
    })

    it('searches as you type and opens the highlighted result with Enter', async () => {
        render(<CommandMenu onToggleSidebar={() => {}} onShowShortcuts={() => {}} />)
        fireEvent.keyDown(document, { key: 'k', metaKey: true })
        const input = await screen.findByLabelText('Search')
        fireEvent.change(input, { target: { value: 'con' } })
        expect(await screen.findByText('Contoso')).toBeTruthy()
        expect(search.quickSearch).toHaveBeenCalledWith('con', 'acme')
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(push).toHaveBeenCalledWith('/d/g/f/acme/c/contoso')
    })

    it('offers firm admin destinations to admins', async () => {
        shell.canManage = true
        render(<CommandMenu onToggleSidebar={() => {}} onShowShortcuts={() => {}} />)
        fireEvent.keyDown(document, { key: 'k', metaKey: true })
        expect(await screen.findByText('Firm settings')).toBeTruthy()
        expect(screen.getByText('Firm overview')).toBeTruthy()
    })
})

describe('useShellShortcuts', () => {
    it('G then I opens the Inbox', () => {
        render(<Shortcuts />)
        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 'i' })
        expect(push).toHaveBeenCalledWith('/d/u/inbox')
    })

    it('ignores keys typed into a field, and admin targets for members', () => {
        render(<Shortcuts />)
        const input = screen.getByLabelText('typing here')
        fireEvent.keyDown(input, { key: 'g' })
        fireEvent.keyDown(input, { key: 'h' })
        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 's' })
        expect(push).not.toHaveBeenCalled()
    })

    it('does nothing for a lone letter without G first', () => {
        render(<Shortcuts />)
        fireEvent.keyDown(window, { key: 'h' })
        expect(push).not.toHaveBeenCalled()
    })
})
