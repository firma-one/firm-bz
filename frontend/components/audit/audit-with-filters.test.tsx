import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/** A failed audit load reads as one, with the reason, not "No audit events"; failed filters say so. */

import { AuditWithFilters } from './audit-with-filters'

// The list loads its next page on scroll; jsdom has no IntersectionObserver.
beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('AuditWithFilters', () => {
    it('a failed load says why instead of an empty list', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (
            String(url).includes('/audit/filters')
                ? new Response(JSON.stringify({ error: 'Something went wrong on our side. Try again.' }), { status: 500 })
                : new Response(JSON.stringify({ error: 'Only firm admins can see the firm’s activity.' }), { status: 403 })
        )))
        render(<AuditWithFilters mode="org" resourceId="f1" exportTitle="audit" showClientProjectFilters firmIdForFilters="f1" />)
        expect(await screen.findByText("Couldn't load activity")).toBeTruthy()
        expect(screen.getByText('Only firm admins can see the firm’s activity.')).toBeTruthy()
        expect(screen.queryByText('No audit events')).toBeNull()
        expect(await screen.findByText(/Couldn't load the client and engagement filters · Something went wrong on our side\./)).toBeTruthy()
    })

    it('an empty history that did load is still empty', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ events: [], nextCursor: null }), { status: 200 })))
        render(<AuditWithFilters mode="project" resourceId="p1" exportTitle="audit" />)
        expect(await screen.findByText('No audit events')).toBeTruthy()
    })
})
