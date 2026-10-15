import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

import { AgendaWeek, type AgendaDueItem, type AgendaEvent } from './agenda-week'

/** Local-time timestamp for a day offset from the frozen "today", at the given hour. */
function at(dayOffset: number, hour = 12): string {
    const d = new Date(2026, 9, 15 + dayOffset, hour)
    return d.toISOString()
}

function event(id: string, dayOffset: number, overrides: Partial<AgendaEvent> = {}): AgendaEvent {
    return {
        id, type: 'due', title: `Event ${id}`, date: at(dayOffset), href: `/e/${id}`,
        engagementId: 'eng-1', clientName: 'Contoso', ...overrides,
    }
}

function due(id: string, dayOffset: number, kind: AgendaDueItem['kind'] = 'deliverable'): AgendaDueItem {
    return { id, kind, title: `Due ${id}`, context: 'FY26 Audit', href: `/d/${id}`, date: at(dayOffset, 17) }
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0)) // Thu Oct 15 2026, 09:00 local
})
afterEach(() => vi.useRealTimers())

describe('AgendaWeek', () => {
    it('shows today and the next six days, with each event linked', () => {
        render(<AgendaWeek events={[event('a', 0), event('b', 3)]} calendarHref="/cal" />)
        expect(screen.getByText('Today')).toBeTruthy()
        expect(screen.getByText('Sun')).toBeTruthy() // Oct 18
        expect(screen.getByText('Wed')).toBeTruthy() // Oct 21, the last of the seven days
        expect(screen.queryByText('Thu')).toBeNull() // Oct 22 is outside the week
        expect(screen.getByRole('link', { name: /Event a/ }).getAttribute('href')).toBe('/e/a')
        expect(screen.getByRole('link', { name: /Event b/ }).getAttribute('href')).toBe('/e/b')
    })

    it('explains a chip with the app tooltip, not the browser\'s', async () => {
        render(<AgendaWeek events={[event('a', 1)]} calendarHref="/cal" />)
        const chip = screen.getByRole('link', { name: /Event a/ })
        expect(chip.getAttribute('title')).toBeNull()
        fireEvent.focus(chip)
        const tip = await screen.findByRole('tooltip')
        expect(tip.textContent).toContain('Event a')
        expect(tip.textContent).toContain('Contoso')
    })

    it('leaves out events before today or after the seventh day', () => {
        render(<AgendaWeek events={[event('past', -1), event('in', 6), event('later', 7)]} calendarHref="/cal" />)
        expect(screen.queryByText('Event past')).toBeNull()
        expect(screen.getByText('Event in')).toBeTruthy()
        expect(screen.queryByText('Event later')).toBeNull()
    })

    it('caps a day at three events and links the rest to the calendar', () => {
        const busy = ['1', '2', '3', '4', '5'].map((id) => event(id, 1))
        render(<AgendaWeek events={busy} calendarHref="/cal" />)
        expect(screen.getAllByRole('link', { name: /^Event / })).toHaveLength(3)
        expect(screen.getByRole('link', { name: '+2 more' }).getAttribute('href')).toBe('/cal')
    })

    it('puts past-due work in an Overdue row and leaves upcoming deliverables to the calendar events', () => {
        render(<AgendaWeek events={[]} dueItems={[due('late', -2), due('older', -5, 'engagement'), due('soon', 2)]} calendarHref="/cal" />)
        expect(screen.getByText('Overdue')).toBeTruthy()
        expect(screen.getByText('2')).toBeTruthy()
        const chips = screen.getAllByRole('link', { name: /^Due / })
        expect(chips.map((c) => c.getAttribute('href'))).toEqual(['/d/older', '/d/late']) // oldest first
        expect(screen.queryByText('Due soon')).toBeNull()
    })

    it('adds upcoming reminders to the week, since the calendar has none', () => {
        render(<AgendaWeek events={[]} dueItems={[due('remind', 1, 'reminder')]} calendarHref="/cal" />)
        expect(screen.queryByText('Overdue')).toBeNull()
        expect(screen.getByRole('link', { name: /Due remind/ }).getAttribute('href')).toBe('/d/remind')
    })

    it('shows six overdue items and expands to the rest', () => {
        const late = ['1', '2', '3', '4', '5', '6', '7', '8'].map((id) => due(id, -1))
        render(<AgendaWeek events={[]} dueItems={late} calendarHref="/cal" />)
        expect(screen.getAllByRole('link', { name: /^Due / })).toHaveLength(6)
        fireEvent.click(screen.getByRole('button', { name: '+2 more' }))
        expect(screen.getAllByRole('link', { name: /^Due / })).toHaveLength(8)
    })

    it('says so when nothing is overdue and the week is empty', () => {
        render(<AgendaWeek events={[]} dueItems={[]} calendarHref="/cal" />)
        expect(screen.getByText('Nothing overdue or on the calendar this week')).toBeTruthy()
        expect(screen.getByRole('link', { name: /Open calendar/ }).getAttribute('href')).toBe('/cal')
    })
})
