import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

import { HomeBookmarks } from './home-bookmarks'
import type { ShellFavorite } from '@/lib/actions/shell'

function bookmark(id: string, overrides: Partial<ShellFavorite> = {}): ShellFavorite {
    return { id, kind: 'project', label: `Bookmark ${id}`, href: `/e/${id}`, context: 'Contoso', ...overrides }
}

describe('HomeBookmarks', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('stays visible when empty and says how to add one', () => {
        render(<HomeBookmarks bookmarks={[]} />)
        expect(screen.getByText('Bookmarks')).toBeTruthy()
        expect(screen.getByText(/No bookmarks yet/)).toBeTruthy()
    })

    it('links each bookmark with where it lives', () => {
        render(<HomeBookmarks bookmarks={[bookmark('1'), bookmark('2', { kind: 'document', label: 'Letter.pdf', context: 'Audit 2026' })]} />)
        expect(screen.getByText('Bookmark 1').closest('a')!.getAttribute('href')).toBe('/e/1')
        expect(screen.getByText('Letter.pdf').closest('a')!.getAttribute('href')).toBe('/e/2')
        expect(screen.getByText('Audit 2026')).toBeTruthy()
    })

    it('shows the first eight, then the rest on request', () => {
        render(<HomeBookmarks bookmarks={Array.from({ length: 10 }, (_, i) => bookmark(String(i + 1)))} />)
        expect(screen.queryByText('Bookmark 9')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
        expect(screen.getByText('Bookmark 10')).toBeTruthy()
    })

    it('removes a bookmark without following its link', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)
        const updated = vi.fn()
        window.addEventListener('pockett-bookmarks-updated', updated)

        render(<HomeBookmarks bookmarks={[bookmark('1'), bookmark('2')]} />)
        const remove = screen.getByRole('button', { name: 'Remove Bookmark 1 from bookmarks' })
        expect(remove.closest('a')).toBeNull()
        fireEvent.click(remove)

        await waitFor(() => expect(screen.queryByText('Bookmark 1')).toBeNull())
        expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ id: '1' }) }))
        expect(updated).toHaveBeenCalled()
        expect(screen.getByText('Bookmark 2')).toBeTruthy()
        expect(screen.queryByText(/No bookmarks yet/)).toBeNull()
        window.removeEventListener('pockett-bookmarks-updated', updated)
    })
})
