import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SecureAccessModal } from './secure-access-modal'
import type { SecureOpenModalMode } from '@/lib/use-secure-open-document'

const show = (mode: SecureOpenModalMode, over: Partial<Parameters<typeof SecureAccessModal>[0]> = {}) => {
    const onClose = vi.fn()
    render(
        <SecureAccessModal
            isOpen onClose={onClose} email="jo@client.com" fileName="Q3 plan.xlsx"
            mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            mode={mode} {...over}
        />,
    )
    return { onClose }
}

afterEach(() => vi.unstubAllGlobals())

describe('SecureAccessModal', () => {
    it('while preparing: one spinner, a title that names the state, and no buttons', () => {
        show('loading')
        expect(screen.getByRole('dialog', { name: 'Preparing secure access' })).toBeTruthy()
        expect(screen.getAllByRole('status', { name: 'Loading' })).toHaveLength(1)
        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.getByText('Q3 plan.xlsx')).toBeTruthy()
    })

    it('opening (OneDrive): no buttons while the tab opens', () => {
        show('opening')
        expect(screen.getByRole('dialog', { name: 'Opening document' })).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('blocked tab (OneDrive): Open document opens the link and closes the dialog', () => {
        const open = vi.fn()
        vi.stubGlobal('open', open)
        const { onClose } = show('blocked', { documentUrl: 'https://contoso.sharepoint.com/doc' })
        expect(screen.getByRole('dialog', { name: 'Ready to open' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
        expect(open).toHaveBeenCalledWith('https://contoso.sharepoint.com/doc', '_blank')
        expect(onClose).toHaveBeenCalled()
    })

    it('email (Google): names the inbox, and Got it closes', () => {
        const { onClose } = show('email')
        expect(screen.getByRole('dialog', { name: 'Check your email' })).toBeTruthy()
        expect(screen.getByText(/sent to jo@client\.com/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('opened (Google, direct): offers a new access link by email, and Done closes', () => {
        const onRequestNewLink = vi.fn()
        const { onClose } = show('opened', { onRequestNewLink })
        expect(screen.getByRole('dialog', { name: 'Opened in a new tab' })).toBeTruthy()
        expect(screen.getByText(/Didn’t get in\?/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Email me a new access link' }))
        expect(onRequestNewLink).toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('error: shows the reason, with Close', () => {
        show('error', { error: 'Your access to this document has been revoked.' })
        expect(screen.getByRole('dialog', { name: 'Access unavailable' })).toBeTruthy()
        expect(screen.getByText('Your access to this document has been revoked.')).toBeTruthy()
        expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
    })

    it('titles are sentence case in every state', () => {
        for (const mode of ['loading', 'opening', 'opened', 'blocked', 'email', 'error'] as const) {
            const { unmount } = render(<SecureAccessModal isOpen onClose={vi.fn()} email="" fileName="f" mode={mode} />)
            const title = screen.getByRole('dialog').getAttribute('aria-labelledby')!
            const words = document.getElementById(title)!.textContent!.split(' ').slice(1)
            expect(words.every((w) => w === w.toLowerCase())).toBe(true)
            unmount()
        }
    })
})
