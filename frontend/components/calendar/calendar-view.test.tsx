import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/*
 * The calendar never reads as empty after a failed load (P1-68): a first load that fails says why
 * with Try again; a refresh that fails keeps what was shown and says why.
 */

const { getFirmCalendarData } = vi.hoisted(() => ({ getFirmCalendarData: vi.fn() }))
vi.mock('@/lib/actions/calendar', () => ({ getFirmCalendarData }))
// FullCalendar draws nothing useful in jsdom; the sidebar and the page around it are what's under test.
vi.mock('@fullcalendar/react', () => ({ default: () => <div data-testid="fullcalendar" /> }))
vi.mock('@fullcalendar/daygrid', () => ({ default: {} }))
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }))
vi.mock('@fullcalendar/list', () => ({ default: {} }))
vi.mock('./calendar-event-detail-modal', () => ({ CalendarEventDetailModal: () => null }))
vi.mock('./calendar-view.css', () => ({}))

import { CalendarView } from './calendar-view'
import { ToastProvider } from '@/components/ui/toast'

const DATA = {
    engagements: [{ id: 'e1', name: 'FY26 Audit', clientId: 'c1', clientName: 'Contoso', status: 'ACTIVE' }],
    events: [],
}
const FAILED = { ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' }

const renderCalendar = () => render(<CalendarView firmSlug="acme" />, { wrapper: ToastProvider })

beforeEach(() => vi.clearAllMocks())

describe('CalendarView', () => {
    it('says a first load failed, with why, never "No engagements yet"; Try again loads it', async () => {
        getFirmCalendarData.mockResolvedValueOnce(FAILED)
        renderCalendar()
        expect(await screen.findByText("Couldn't load the calendar")).toBeTruthy()
        expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy()
        expect(screen.queryByText('No engagements yet.')).toBeNull()

        getFirmCalendarData.mockResolvedValueOnce({ ok: true, data: DATA })
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('FY26 Audit')).toBeTruthy()
    })

    it('says a dropped connection is one', async () => {
        getFirmCalendarData.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        renderCalendar()
        expect(await screen.findByText("Couldn't reach firma. Check your connection and try again.")).toBeTruthy()
    })

    it('a failed refresh keeps what was shown and says why', async () => {
        getFirmCalendarData.mockResolvedValueOnce({ ok: true, data: DATA })
        renderCalendar()
        expect(await screen.findByText('FY26 Audit')).toBeTruthy()

        getFirmCalendarData.mockResolvedValueOnce(FAILED)
        fireEvent.click(screen.getByRole('button', { name: 'Refresh calendar' }))
        expect(await screen.findByText("Couldn't refresh the calendar")).toBeTruthy()
        await waitFor(() => expect(screen.getByText('FY26 Audit')).toBeTruthy())
        expect(screen.queryByText('No engagements yet.')).toBeNull()
    })
})
