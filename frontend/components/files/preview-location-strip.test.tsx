import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The strip under a preview's header: where the document lives and how to start work on it.

const { pane } = vi.hoisted(() => ({ pane: { paneSize: 'medium' as 'small' | 'medium' | 'large' } }))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => pane }))

import { PreviewLocationStrip } from './preview-location-strip'

const PATH = ['Engagement root', 'Market Research', 'Source Material']
const FILES = 'https://app.test/e/files#doc-file:d1'
const strip = (props: Partial<React.ComponentProps<typeof PreviewLocationStrip>> = {}) =>
    render(<PreviewLocationStrip folderPath={PATH} filesUrl={FILES} openLabel="Open in OneDrive" onOpen={vi.fn()} {...props} />)

beforeEach(() => {
    pane.paneSize = 'medium'
    // Radix positions its tooltip with this; jsdom has none.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('PreviewLocationStrip', () => {
    it('names the folders and opens Files in a new tab, as search and the Documents list do', () => {
        strip()
        expect(screen.getByText('Engagement root / Market Research / Source Material')).toBeTruthy()
        const link = screen.getByRole('link', { name: 'Open in Files' }) as HTMLAnchorElement
        expect(link.href).toBe(FILES)
        expect(link.target).toBe('_blank')
        expect(link.rel).toContain('noopener')
    })

    it('makes the path a way to Files too', () => {
        strip()
        const path = screen.getByRole('link', { name: `Open in Files: ${PATH.join(' / ')}` }) as HTMLAnchorElement
        expect(path.href).toBe(FILES)
    })

    it('opens the document', () => {
        const onOpen = vi.fn()
        strip({ onOpen })
        fireEvent.click(screen.getByRole('button', { name: 'Open in OneDrive' }))
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('keeps Open in place but off, when it has a reason', () => {
        const onOpen = vi.fn()
        strip({ onOpen, openOffReason: 'Approved deliverables open in preview only' })
        const open = screen.getByRole('button', { name: 'Open in OneDrive' })
        expect(open.getAttribute('aria-disabled')).toBe('true')
        fireEvent.click(open)
        expect(onOpen).not.toHaveBeenCalled()
        expect(screen.getByRole('link', { name: 'Open in Files' })).toBeTruthy()
    })

    it.each(['small', 'medium', 'large'] as const)('shows both actions as named icons at %s', (size) => {
        pane.paneSize = size
        strip()
        expect(screen.getByRole('link', { name: 'Open in Files' }).textContent).toBe('')
        expect(screen.getByRole('button', { name: 'Open in OneDrive' }).textContent).toBe('')
    })

    it.each([
        ['link', 'Open in Files', {}, 'Open in Files'],
        ['button', 'Open in OneDrive', {}, 'Open in OneDrive'],
        ['button', 'Open in OneDrive', { openOffReason: 'Approved deliverables open in preview only' }, 'Approved deliverables open in preview only'],
    ] as const)('explains the %s named %s in its tooltip', async (role, name, props, tooltip) => {
        strip(props)
        fireEvent.focus(screen.getByRole(role, { name }))
        expect((await screen.findByRole('tooltip')).textContent).toBe(tooltip)
    })

    it('shortens the path in the Small pane to the nearest folders', () => {
        pane.paneSize = 'small'
        strip()
        expect(screen.getByText('… / Market Research / Source Material')).toBeTruthy()
    })

    it('shows a short path whole in the Small pane', () => {
        pane.paneSize = 'small'
        strip({ folderPath: ['Engagement root', 'Market Research'] })
        expect(screen.getByText('Engagement root / Market Research')).toBeTruthy()
    })

    it('shows the path as plain text when there is no link to Files', () => {
        strip({ filesUrl: null })
        expect(screen.getByText(PATH.join(' / '))).toBeTruthy()
        expect(screen.queryByRole('link')).toBeNull()
    })

    it('still offers its actions when the folders are unknown', () => {
        strip({ folderPath: [] })
        expect(screen.getByRole('link', { name: 'Open in Files' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Open in OneDrive' })).toBeTruthy()
    })
})
