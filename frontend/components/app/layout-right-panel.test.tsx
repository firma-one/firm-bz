import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// The right pane holds one copy of its content at every size. Two copies each fetched their own data and
// kept their own tab, scroll and draft, so opening a deliverable loaded everything twice and going full
// screen lost your place.

vi.mock('@/lib/sidebar-context', () => ({ useSidebar: () => ({ isCollapsed: true, toggleSidebar: vi.fn() }) }))
vi.mock('@/lib/use-branding', () => ({ useBranding: () => null }))
vi.mock('@/components/shell/shell-data-context', () => ({ useOptionalShellData: () => null }))
vi.mock('@/components/shell/workspace-switcher', () => ({ FirmMark: () => null }))
vi.mock('@/components/Logo', () => ({ default: () => null }))

import { LayoutRightPanel } from './layout-right-panel'
import { RightPaneProvider, useRightPane } from '@/lib/right-pane-context'

let mounts = 0

function Content() {
    const [draft, setDraft] = useState('')
    useEffect(() => { mounts += 1 }, [])
    return <textarea aria-label="Draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
}

function Pane({ beforeClose, onClose = () => {} }: { beforeClose?: () => boolean; onClose?: () => void }) {
    const { paneSize } = useRightPane()
    return (
        <>
            <output data-testid="size">{paneSize}</output>
            <LayoutRightPanel title="Doc" firm={{ name: 'Firm', logoUrl: null }} embedContent onClose={onClose} beforeClose={beforeClose}>
                <Content />
            </LayoutRightPanel>
        </>
    )
}

const open = (props: React.ComponentProps<typeof Pane> = {}) => {
    mounts = 0
    return render(<RightPaneProvider><Pane {...props} /></RightPaneProvider>)
}
const size = (label: 'Side panel' | 'Half screen' | 'Full screen') => fireEvent.click(screen.getByRole('button', { name: label }))

afterEach(cleanup)

describe('LayoutRightPanel', () => {
    it('mounts its content once', () => {
        open()
        expect(screen.getAllByRole('textbox', { name: 'Draft' })).toHaveLength(1)
        expect(mounts).toBe(1)
    })

    it.each(['Half screen', 'Full screen', 'Side panel'] as const)('keeps the same content, and what was typed, at %s', (label) => {
        open()
        const box = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement
        fireEvent.change(box, { target: { value: 'half-typed' } })

        size('Full screen')
        size(label)

        expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(box)
        expect(box.value).toBe('half-typed')
        expect(mounts).toBe(1)
    })

    it('shows one set of controls at each size', () => {
        open()
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
        size('Full screen')
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
        expect(screen.getByText('Firm')).toBeTruthy()
    })

    it('covers the screen at full screen, with nothing to stop it reaching the viewport', () => {
        open()
        const pane = screen.getByRole('complementary')
        expect(pane.className).not.toContain('fixed')
        size('Full screen')
        expect(pane.className).toContain('fixed')
        expect(pane.className).toContain('inset-0')
        expect(pane.style.transform).toBe('')
    })

    it('stays open when its content refuses the close, whatever the size', () => {
        const onClose = vi.fn()
        open({ beforeClose: () => false, onClose })
        size('Full screen')
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.getByTestId('size').textContent).toBe('large')
        expect(onClose).not.toHaveBeenCalled()
    })

    it('closes from full screen back to the side panel size', () => {
        vi.useFakeTimers()
        try {
            const onClose = vi.fn()
            open({ onClose })
            size('Full screen')
            fireEvent.click(screen.getByRole('button', { name: 'Close' }))
            expect(screen.getByTestId('size').textContent).toBe('small')
            act(() => { vi.advanceTimersByTime(400) })
            expect(onClose).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })
})
