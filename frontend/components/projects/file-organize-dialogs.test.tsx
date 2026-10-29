import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopyMoveDialog, CopyToEngagementDialog, RenameDialog, UploadConflictDialog } from './file-organize-dialogs'
import type { DriveFile } from '@/lib/types'

const folder = (id: string, name: string) => ({ id, name, mimeType: 'application/vnd.google-apps.folder' }) as DriveFile

describe('CopyMoveDialog', () => {
    const base = {
        open: true, onOpenChange: vi.fn(), action: 'move' as const, targetName: 'Plan.xlsx', keepBoth: true,
        onKeepBothChange: vi.fn(), path: [{ id: 'gen', name: 'General' }], onPathClick: vi.fn(), loading: false,
        folders: [folder('f1', 'Reports'), folder('f2', 'Empty'), folder('f3', 'Pending')], emptyFolderIds: new Set(['f2']), subfolderIds: new Set(['f1']), checkingFolderId: null,
        submittingFolderId: null, onOpenFolder: vi.fn(), onSubmit: vi.fn(), onCancel: vi.fn(),
    }

    it('a sentence-case title, the file in the context line, and no uppercase labels', () => {
        render(<CopyMoveDialog {...base} />)
        expect(screen.getByRole('dialog', { name: 'Move to folder' })).toBeTruthy()
        // The file as a chip, with its full name on hover.
        expect(screen.getByTitle('Plan.xlsx').textContent).toBe('Plan.xlsx')
        expect(screen.getByText('If the name already exists')).toBeTruthy()
        expect(document.querySelector('.uppercase')).toBeNull()
    })

    it('moves into a folder row, into the root, opens a folder that has subfolders, and switches Keep both / Replace', () => {
        render(<CopyMoveDialog {...base} />)
        fireEvent.click(screen.getByRole('button', { name: 'Move here' }))
        expect(base.onSubmit).toHaveBeenCalledWith('gen')
        fireEvent.click(screen.getByRole('button', { name: 'Move to Reports' }))
        expect(base.onSubmit).toHaveBeenCalledWith('f1')
        fireEvent.click(screen.getByTitle('Open Reports'))
        expect(base.onOpenFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))
        fireEvent.click(screen.getByTitle('No subfolders'))
        expect(base.onOpenFolder).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
        expect(base.onKeepBothChange).toHaveBeenCalledWith(false)
        expect(screen.getByRole('button', { name: 'Keep both' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('only a folder known to have subfolders shows an arrow — none for an empty one or one still being checked', () => {
        render(<CopyMoveDialog {...base} />)
        const arrows = (name: string) => (screen.getByText(name).closest('button') as HTMLElement).querySelectorAll('svg.lucide-chevron-right').length
        expect(arrows('Reports')).toBe(1)
        expect(arrows('Empty')).toBe(0)
        expect(arrows('Pending')).toBe(0)
    })

    it('Copy reads Copy, and Cancel cancels', () => {
        render(<CopyMoveDialog {...base} action="copy" />)
        expect(screen.getByRole('dialog', { name: 'Copy to folder' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Copy here' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Copy to Reports' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(base.onCancel).toHaveBeenCalled()
    })

    it('a deliverable and the folders inside one wear folder-plus, in the list and the path', () => {
        const kinds: Record<string, 'deliverable' | 'inside'> = { f1: 'deliverable', f3: 'inside', d2: 'inside' }
        render(
            <CopyMoveDialog
                {...base}
                path={[{ id: 'gen', name: 'General' }, { id: 'd2', name: 'Drafts' }]}
                deliverableKindOf={(id) => kinds[id] ?? null}
            />
        )
        const mark = (name: string) => (screen.getByText(name).closest('button') as HTMLElement).querySelector('[role="img"]')?.getAttribute('aria-label') ?? null
        expect(mark('Reports')).toBe('Deliverable')
        expect(mark('Pending')).toBe('Inside a deliverable')
        expect(mark('Empty')).toBeNull()
        expect(mark('Drafts')).toBe('Inside a deliverable')
    })

    it('names how many items go when there are several', () => {
        render(<CopyMoveDialog {...base} targetCount={3} />)
        expect(screen.getByRole('dialog', { name: 'Move 3 items to folder' })).toBeTruthy()
        expect(screen.getByText('3 items')).toBeTruthy()
    })
})

describe('CopyToEngagementDialog', () => {
    const base = {
        open: true, onOpenChange: vi.fn(), targetName: 'Plan.xlsx', firmName: 'FirmaOne', loading: false,
        engagements: [
            { id: 'e2', name: 'Zeta rollout', clientId: 'c1', clientName: 'Acme' },
            { id: 'e1', name: 'Alpha audit', clientId: 'c1', clientName: 'Acme' },
        ],
        selectedId: null as string | null, onSelect: vi.fn(), submitting: false, onSubmit: vi.fn(), onCancel: vi.fn(),
    }

    it('lists engagements by client, alphabetically; Copy waits for a pick', () => {
        render(<CopyToEngagementDialog {...base} />)
        expect(screen.getByRole('dialog', { name: 'Copy to another engagement' })).toBeTruthy()
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Alpha audit', 'Zeta rollout'])
        expect((screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(screen.getByRole('option', { name: 'Alpha audit' }))
        expect(base.onSelect).toHaveBeenCalledWith('e1')
    })

    it('with a pick, Copy submits', () => {
        render(<CopyToEngagementDialog {...base} selectedId="e1" />)
        expect(screen.getByRole('option', { name: 'Alpha audit' }).getAttribute('aria-selected')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
        expect(base.onSubmit).toHaveBeenCalled()
    })
})

describe('RenameDialog', () => {
    it('Enter or Save submits a name; the extension shows after the field', () => {
        const onSubmit = vi.fn()
        render(<RenameDialog open onOpenChange={vi.fn()} targetName="Plan.xlsx" value="Plan v2" onChange={vi.fn()} extension=".xlsx" submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />)
        expect(screen.getByRole('dialog', { name: 'Rename' })).toBeTruthy()
        expect(screen.getByText('.xlsx')).toBeTruthy()
        fireEvent.submit(screen.getByRole('textbox', { name: 'New name' }).closest('form')!)
        expect(onSubmit).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(onSubmit).toHaveBeenCalledTimes(2)
    })

    it('an empty name cannot be saved', () => {
        const onSubmit = vi.fn()
        render(<RenameDialog open onOpenChange={vi.fn()} value="  " onChange={vi.fn()} submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />)
        expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.submit(screen.getByRole('textbox', { name: 'New name' }).closest('form')!)
        expect(onSubmit).not.toHaveBeenCalled()
    })
})

describe('UploadConflictDialog', () => {
    // Radix's checkbox measures itself; jsdom has no ResizeObserver.
    beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })
    afterAll(() => { vi.unstubAllGlobals() })
    const files = [{ name: 'Plan.xlsx' }, { name: 'Deck.pptx' }]

    it('names how many, says what each will do, and Replace all toggles them all', () => {
        const onReplaceAllChange = vi.fn()
        render(<UploadConflictDialog files={files} replace={new Set(['Plan.xlsx'])} onReplaceChange={vi.fn()} onReplaceAllChange={onReplaceAllChange} onCancel={vi.fn()} onConfirm={vi.fn()} />)
        expect(screen.getByRole('dialog', { name: '2 files already in this folder' })).toBeTruthy()
        expect(screen.getByText('Replaces the existing file')).toBeTruthy()
        expect(screen.getByText('Uploads as a copy')).toBeTruthy()
        fireEvent.click(screen.getByRole('checkbox', { name: 'Replace all' }))
        expect(onReplaceAllChange).toHaveBeenCalledWith(true)
    })

    it('one file: no Replace all; its checkbox, Upload and Cancel do what they say', () => {
        const onReplaceChange = vi.fn(), onConfirm = vi.fn(), onCancel = vi.fn()
        render(<UploadConflictDialog files={[files[0]]} replace={new Set()} onReplaceChange={onReplaceChange} onReplaceAllChange={vi.fn()} onCancel={onCancel} onConfirm={onConfirm} />)
        expect(screen.getByRole('dialog', { name: 'This file is already in the folder' })).toBeTruthy()
        expect(screen.queryByRole('checkbox', { name: 'Replace all' })).toBeNull()
        fireEvent.click(screen.getByRole('checkbox', { name: 'Replace Plan.xlsx' }))
        expect(onReplaceChange).toHaveBeenCalledWith('Plan.xlsx', true)
        fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
        expect(onConfirm).toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onCancel).toHaveBeenCalled()
    })
})
