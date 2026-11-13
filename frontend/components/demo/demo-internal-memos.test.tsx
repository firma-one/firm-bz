import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * /tour's Internal memos card: the app's card over canned calls in memory. Find actions answers with
 * canned proposals, Apply marks the row and is remembered, and a memo added joins the list, all
 * without a request.
 */

const h = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: h.addToast }) }))

import { DemoInternalMemos } from './demo-internal-memos'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'

const engagement = DEMO_FIRM.clients[0].engagements[0]

beforeEach(() => {
    h.addToast.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('/tour sends nothing') }))
})
afterEach(() => vi.unstubAllGlobals())

describe('DemoInternalMemos', () => {
    it('lists the canned calls, newest first, as the app does', async () => {
        render(<DemoInternalMemos engagement={engagement} today={new Date()} />)
        expect(await screen.findByText('Weekly check-in')).toBeTruthy()
        const titles = screen.getAllByText(/^(Weekly check-in|Kickoff call|Scoping call)$/).map((n) => n.textContent)
        expect(titles).toEqual(['Weekly check-in', 'Kickoff call', 'Scoping call'])
        expect(screen.getByText('Sam · transcript, 38 min')).toBeTruthy()
        expect(screen.getByText('1 action applied')).toBeTruthy()
    })

    it('Find actions shows canned proposals, and an applied one is remembered', async () => {
        render(<DemoInternalMemos engagement={engagement} today={new Date()} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Find actions in Kickoff call' }))
        const row = screen.getByTestId('memo-tour-memo-kickoff')
        fireEvent.click(await within(row).findByRole('button', { name: 'Apply 1 selected' }, { timeout: 3000 }))
        await waitFor(() => expect(within(row).getByText('1 action applied')).toBeTruthy(), { timeout: 3000 })

        fireEvent.click(within(row).getByRole('button', { name: 'Find actions in Kickoff call' }))
        expect(await within(row).findByText('Applied earlier from this memo', {}, { timeout: 3000 })).toBeTruthy()
        expect(fetch).not.toHaveBeenCalled()
    })

    it('a memo added joins the list', async () => {
        render(<DemoInternalMemos engagement={engagement} today={new Date()} />)
        fireEvent.click(await screen.findByRole('button', { name: /Add internal memo/ }))
        fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Budget review' } })
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2030-01-15' } })
        fireEvent.change(screen.getByLabelText('Notes or transcript'), { target: { value: 'Agreed to send the revised budget' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save memo' }))
        expect(await screen.findByText('Budget review', {}, { timeout: 3000 })).toBeTruthy()
        expect(h.addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Memo saved', message: 'Saved as 2030-01-15-Budget-review.md in Internal Memos.' }))
        expect(fetch).not.toHaveBeenCalled()
    })
})
