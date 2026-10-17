import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FirmEngagementsList } from './firm-overview-sections'
import type { FirmEngagementRow } from '@/lib/insights/firm-engagement-pace'

const NOW = new Date('2026-10-17T12:00:00').getTime()
const DAY = 86400000
const iso = (days: number) => new Date(NOW + days * DAY).toISOString()

const row = (name: string, over: Partial<FirmEngagementRow>): FirmEngagementRow => ({
    engagementId: name, name, slug: name.toLowerCase(), clientName: 'Acme', clientSlug: 'acme',
    startDate: iso(-50), dueDate: iso(50), lead: { name: 'Ana Lopez', avatarUrl: null },
    deliverables: { total: 2, toDo: 1, inProgress: 0, inReview: 0, approved: 1, overdue: 0 },
    ...over,
})

describe('FirmEngagementsList', () => {
    it('lists the worst first, each linking to its engagement', () => {
        render(<FirmEngagementsList
            nowMs={NOW}
            hrefFor={(r) => `/e/${r.slug}`}
            rows={[
                row('Fine', {}),
                row('Late', { dueDate: iso(-2) }),
                row('Undated', { dueDate: null, lead: null }),
            ]}
        />)
        const links = screen.getAllByRole('link')
        expect(links.map((l) => l.getAttribute('href'))).toEqual(['/e/late', '/e/fine', '/e/undated'])
        expect(links[0].textContent).toContain('2 days overdue')
        expect(links[0].textContent).toContain('Overdue')
        expect(links[1].textContent).toContain('1 of 2 approved')
        expect(links[2].textContent).toContain('No lead')
        expect(links[2].textContent).toContain('No due date')
    })

    it('says so when there are no active engagements', () => {
        render(<FirmEngagementsList nowMs={NOW} rows={[]} />)
        expect(screen.getByText('No active engagements yet.')).toBeTruthy()
    })
})
