import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { RaidLink } from './raid-tab'

describe('RaidLink', () => {
    it('shows it is opening from the click until the page goes, so a slow load does not read as a dead link', () => {
        render(<RaidLink href="/d/g/f/acme/c/contoso/e/audit/comments#doc-comment:doc-1">Thread · FRM-49</RaidLink>)
        const link = screen.getByRole('link', { name: /Thread · FRM-49/ })
        expect(link.getAttribute('aria-busy')).toBeNull()

        // jsdom doesn't navigate (it logs "not implemented"); the click is what matters here.
        fireEvent.click(link, { button: 0 })
        expect(link.getAttribute('aria-busy')).toBe('true')
        expect(link.textContent).toContain('opening')

        // Back to this page from the browser's history: no longer opening.
        act(() => { window.dispatchEvent(new Event('pageshow')) })
        expect(link.getAttribute('aria-busy')).toBeNull()
    })

    it('a click for a new tab leaves the link as it is', () => {
        render(<RaidLink href="/d/x/comments">Thread</RaidLink>)
        const link = screen.getByRole('link', { name: 'Thread' })
        fireEvent.click(link, { button: 0, metaKey: true })
        expect(link.getAttribute('aria-busy')).toBeNull()
    })
})
