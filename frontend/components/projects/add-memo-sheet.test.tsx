import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { AddMemoSheet, editSummary, type AddMemoOutcome, type EditMemoContext } from './add-memo-sheet'

/**
 * The Edit memo sheet (§14.3): filled in from the memo, saying what saving does before it's saved, and
 * handing over only what changed. `onSave` is a stub: nothing is sent anywhere.
 */

const BODY = 'Alex Jordan: Not yet. I’ll check with finance this week.\nDana Whitfield: Good.'
const EDIT: Omit<EditMemoContext, 'onSave'> = {
    memo: { title: 'Call with Dana', date: '2026-11-12', source: 'transcript', durationMinutes: 31, fileName: '2026-11-12-Call-with-Dana.md' },
    body: BODY,
    storage: 'Google Drive',
    waiting: { actionItems: 2, raid: 1 },
    applied: [{ label: 'Reminder · Send Dana the revised launch timeline', at: '2026-11-12T15:00:00.000Z' }],
    canIdentify: true,
}

describe('editSummary', () => {
    it('a new title renames the file and changes no action item', () => {
        const s = editSummary({ edit: EDIT, title: 'Call with Dana, pricing', date: '2026-11-12', body: BODY })
        expect(s).toEqual({ rename: '2026-11-12-Call-with-Dana,-pricing.md', notesChanged: false, headingChanged: true, stops: null, kept: null })
    })

    it('new notes stop what waits, and keep what was applied', () => {
        const s = editSummary({ edit: EDIT, title: 'Call with Dana', date: '2026-11-12', body: `${BODY}\nAlex Jordan: I’ll update the landing page by Wednesday.` })
        expect(s).toEqual(expect.objectContaining({
            rename: null, notesChanged: true, headingChanged: false,
            stops: '2 action items and 1 RAID suggestion',
            kept: 'the reminder you applied, “Send Dana the revised launch timeline”',
        }))
    })

    it('spacing and curly quotes alone aren\'t new notes', () => {
        const s = editSummary({ edit: EDIT, title: 'Call with Dana', date: '2026-11-12', body: `  ${BODY.replace('’', "'")}\n\n` })
        expect(s.notesChanged).toBe(false)
    })

    it('several applied: counted', () => {
        const edit = { ...EDIT, applied: [...EDIT.applied, { label: 'Due date · QPL-14 to 2026-12-04', at: '2026-11-12T15:05:00.000Z' }] }
        expect(editSummary({ edit, title: 'Call with Dana', date: '2026-11-12', body: 'New notes' }).kept).toBe('the 2 action items you applied')
    })
})

describe('AddMemoSheet, editing', () => {
    const renderEdit = (onSave: EditMemoContext['onSave'] & ReturnType<typeof vi.fn> = vi.fn(async (): Promise<AddMemoOutcome> => ({ ok: true }))) => {
        render(<AddMemoSheet open onOpenChange={vi.fn()} edit={{ ...EDIT, onSave }} />)
        return onSave
    }

    it('opens filled in, says where the file is, and saves nothing until something changes', () => {
        renderEdit()
        expect(screen.getByRole('heading', { name: 'Edit memo' })).toBeTruthy()
        expect(screen.getByText('A Markdown file in “Internal Memos” in your Google Drive. Saving changes the file there too.')).toBeTruthy()
        expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Call with Dana')
        expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(BODY)
        expect(screen.getByText('Change the title, the date or the notes to save.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true)
        expect(screen.getByText('Recorded in the audit trail.')).toBeTruthy()
    })

    it('a new title: renamed, the action items kept, the notes not sent', async () => {
        const onSave = renderEdit()
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Call with Dana, pricing' } })
        expect(screen.getByText('2026-11-12-Call-with-Dana,-pricing.md')).toBeTruthy()
        expect(screen.getByText(/Action items stay as they are/)).toBeTruthy()
        expect(screen.queryByRole('checkbox')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(onSave).toHaveBeenCalled())
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call with Dana, pricing', body: null, identify: false, source: 'transcript', durationMinutes: 31 }))
    })

    it('new notes: what stops waiting, what\'s kept, and Brio reads them unless unticked', async () => {
        const onSave = renderEdit()
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: `${BODY}\nAlex Jordan: The report moves to December 4.` } })
        // RAID gets its info icon, so the words span the icon's wrapper.
        const stops = screen.getByText((_, el) => el?.tagName === 'B' && el.textContent === '2 action items and 1 RAID suggestion')
        expect(within(stops).getByRole('button', { name: 'What RAID means' })).toBeTruthy()
        expect(screen.getByText(/Kept as it is: the reminder you applied, “Send Dana the revised launch timeline”/)).toBeTruthy()
        const box = screen.getByRole('checkbox')
        expect(box.getAttribute('data-state')).toBe('checked')
        fireEvent.click(box)
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(onSave).toHaveBeenCalled())
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ body: `${BODY}\nAlex Jordan: The report moves to December 4.`, identify: false }))
    })

    it('replacing the notes with a memo\'s own file takes its notes, not its title and day line again', async () => {
        renderEdit()
        const file = new File(['# Call with Dana\n\nThursday, November 12, 2026 · Alex Jordan\n\nDana: The K-1s come Friday.\n'], '2026-11-12-Call-with-Dana.md', { type: 'text/markdown' })
        fireEvent.change(screen.getByLabelText('Attach a .txt, .md or .vtt file'), { target: { files: [file] } })
        await waitFor(() => expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Dana: The K-1s come Friday.'))
    })

    it('a Markdown file of your own keeps its heading', async () => {
        renderEdit()
        const file = new File(['# Pricing\n\n- Finance confirmed the rate card'], 'pricing.md', { type: 'text/markdown' })
        fireEvent.change(screen.getByLabelText('Attach a .txt, .md or .vtt file'), { target: { files: [file] } })
        await waitFor(() => expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('# Pricing\n\n- Finance confirmed the rate card'))
    })

    it('a refusal is shown on the sheet, which stays open', async () => {
        renderEdit(vi.fn(async (): Promise<AddMemoOutcome> => ({ ok: false, error: "Google Drive didn't save the memo and didn't say why. Try again in a moment." })))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Call with Dana, pricing' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect((await screen.findByRole('alert')).textContent).toBe("Google Drive didn't save the memo and didn't say why. Try again in a moment.")
        expect(screen.getByRole('heading', { name: 'Edit memo' })).toBeTruthy()
    })
})
