import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MyEngagementsList } from './home-client'
import type { HomeEngagement } from '@/lib/home/my-work'

const engagement = (over: Partial<HomeEngagement>): HomeEngagement => ({
    id: 'e1', name: 'GTM Positioning', href: '/e/gtm', firmId: 'f1', clientName: 'DataSentry',
    status: 'ACTIVE', dueDate: null, updatedAt: new Date().toISOString(), role: 'eng_admin', ...over,
})

/** The lucide icons inside an element, by name ("users", "briefcase", "building2"). */
const icons = (el: Element) => Array.from(el.querySelectorAll('svg')).map((s) => (s.getAttribute('class') ?? '').match(/lucide-([a-z0-9-]+)/)?.[1])

describe('MyEngagementsList — icons', () => {
    it('marks client groups with the client icon and every engagement with the engagement icon', () => {
        render(<MyEngagementsList engagements={[engagement({})]} />)
        const group = screen.getByRole('button', { name: /DataSentry/ })
        expect(icons(group)).toContain('users')
        const row = screen.getByRole('link', { name: /GTM Positioning/ })
        expect(icons(row)).toContain('briefcase')
    })

    it('marks firm groups with the firm icon, and names each row\'s client with its icon', () => {
        render(<MyEngagementsList engagements={[engagement({})]} firmNames={{ f1: 'FirmaOne' }} />)
        const group = screen.getByRole('button', { name: /FirmaOne/ })
        expect(icons(group)).toContain('building2')
        const row = screen.getByRole('link', { name: /GTM Positioning/ })
        expect(icons(row)).toEqual(expect.arrayContaining(['briefcase', 'users']))
    })

    it('by status, a row carries its client and firm, each with its icon', () => {
        render(<MyEngagementsList engagements={[engagement({})]} firmNames={{ f1: 'FirmaOne' }} />)
        fireEvent.click(screen.getByRole('button', { name: 'By status' }))
        const row = screen.getByRole('link', { name: /GTM Positioning/ })
        expect(icons(row)).toEqual(expect.arrayContaining(['briefcase', 'users', 'building2']))
    })
})
