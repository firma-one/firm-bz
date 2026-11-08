import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The crash screens: plain words with a reference, a report that carries the firm from today's
 * URLs, and "Couldn't send your report" when the action answers { success: false } (it used to say
 * "Thank you! Report submitted." over a report that didn't exist).
 */

const { submitErrorTicket } = vi.hoisted(() => ({ submitErrorTicket: vi.fn() }))
vi.mock('@/app/actions/submit-ticket', () => ({ submitErrorTicket }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { slugsFromPath, crashReference, sendCrashReport } from './crash-report'
import AppError from '@/app/error'
import GlobalError from '@/app/global-error'
import { ErrorBoundary } from '@/components/error-boundary'

beforeEach(() => { submitErrorTicket.mockReset() })

describe('slugsFromPath', () => {
    it('reads the firm, client and engagement from today’s URLs', () => {
        expect(slugsFromPath('/d/acme-group/f/acme/c/contoso/e/fy26-audit/files')).toEqual({ firmSlug: 'acme', clientSlug: 'contoso', projectSlug: 'fy26-audit' })
        expect(slugsFromPath('/d/acme-group/f/acme')).toEqual({ firmSlug: 'acme', clientSlug: undefined, projectSlug: undefined })
        expect(slugsFromPath('/d/acme-group/f/acme/c/contoso')).toMatchObject({ firmSlug: 'acme', clientSlug: 'contoso' })
    })

    it('finds nothing outside a firm', () => {
        expect(slugsFromPath('/d/u/home')).toEqual({ firmSlug: undefined, clientSlug: undefined, projectSlug: undefined })
        expect(slugsFromPath('/d/acme-group/f/')).toMatchObject({ firmSlug: undefined })
    })
})

describe('sendCrashReport', () => {
    it('sends the firm from the URL', async () => {
        window.history.pushState({}, '', '/d/acme-group/f/acme/c/contoso/e/fy26-audit/files')
        submitErrorTicket.mockResolvedValue({ success: true, message: 'ok', ticketNumber: 'TKT-1' })
        await expect(sendCrashReport({ feedback: 'Clicked Save', error: { message: 'boom' } })).resolves.toEqual({ ok: true, ticketNumber: 'TKT-1' })
        expect(submitErrorTicket).toHaveBeenCalledWith(expect.objectContaining({ firmSlug: 'acme', clientSlug: 'contoso', projectSlug: 'fy26-audit' }))
    })

    it('a { success: false } answer is not a sent report', async () => {
        submitErrorTicket.mockResolvedValue({ success: false, message: 'Failed to submit ticket' })
        const out = await sendCrashReport({ feedback: 'x', error: { message: 'boom' } })
        expect(out).toEqual({ ok: false, message: "Couldn't send your report. Please email support@firmaone.com." })
    })

    it('a thrown action is not a sent report either', async () => {
        submitErrorTicket.mockRejectedValue(new TypeError('Failed to fetch'))
        expect((await sendCrashReport({ feedback: 'x', error: { message: 'boom' } })).ok).toBe(false)
    })
})

describe('the crash screens', () => {
    it('app/error: plain words, the reference, and no false "Report submitted"', async () => {
        submitErrorTicket.mockResolvedValue({ success: false, message: 'Failed to submit ticket' })
        const error = Object.assign(new Error('boom'), { digest: '3021944' })
        render(<AppError error={error} reset={vi.fn()} />)
        expect(screen.getByText('Something went wrong on this page')).toBeTruthy()
        expect(screen.getByText('Reference 3021944')).toBeTruthy()

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I clicked Save' } })
        fireEvent.click(screen.getByRole('button', { name: /Send Report/i }))
        expect(await screen.findByText("Couldn't send your report. Please email support@firmaone.com.")).toBeTruthy()
        expect(screen.queryByText(/Report submitted/)).toBeNull()
    })

    it('app/error: says thank you only when the report arrived', async () => {
        submitErrorTicket.mockResolvedValue({ success: true, message: 'ok', ticketNumber: 'TKT-2' })
        render(<AppError error={new Error('boom')} reset={vi.fn()} />)
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I clicked Save' } })
        fireEvent.click(screen.getByRole('button', { name: /Send Report/i }))
        expect(await screen.findByText(/Report submitted/)).toBeTruthy()
    })

    it('the section boundary does the same', async () => {
        submitErrorTicket.mockResolvedValue({ success: false, message: 'Failed to submit ticket' })
        const Boom = () => { throw new Error('render failed') }
        vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<ErrorBoundary><Boom /></ErrorBoundary>)
        expect(screen.getByText('Something went wrong on this page')).toBeTruthy()
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Opening Files' } })
        fireEvent.click(screen.getByRole('button', { name: /Send report/i }))
        await waitFor(() => expect(screen.getByText("Couldn't send your report. Please email support@firmaone.com.")).toBeTruthy())
        expect(screen.queryByText(/Report submitted/)).toBeNull()
    })

    it('global-error: a reference, not "A critical error occurred"', () => {
        // It renders its own <html>; React warns about that inside a test container, harmlessly.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<GlobalError error={Object.assign(new Error('boom'), { digest: '99' })} reset={vi.fn()} />)
        expect(screen.getByText('Something went wrong on this page')).toBeTruthy()
        expect(screen.getByText('Reference 99')).toBeTruthy()
        expect(screen.queryByText(/critical error occurred/i)).toBeNull()
    })

    it('crashReference is empty without a digest', () => {
        expect(crashReference(undefined)).toBeNull()
    })
})
