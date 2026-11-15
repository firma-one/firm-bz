import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InternalFolderIcon, InternalOnlyFolderIcon } from './private-mark'

/**
 * Folder marks in the Files table: a plain folder (outside any deliverable) keeps the folder icon and
 * says on hover that only the firm sees it; the lock is kept for a folder made Internal only inside
 * a deliverable, the exception.
 */
describe('folder marks', () => {
    it('a plain folder is a folder, not a lock, and says who sees it', async () => {
        const { container } = render(<TooltipProvider><InternalFolderIcon /></TooltipProvider>)
        expect(screen.getByRole('img', { name: 'Internal folder' })).toBeTruthy()
        expect(container.querySelector('svg.lucide-folder')).not.toBeNull()
        expect(container.querySelector('svg.lucide-folder-lock')).toBeNull()
    })

    it('an internal only folder keeps the lock', () => {
        const { container } = render(<TooltipProvider><InternalOnlyFolderIcon /></TooltipProvider>)
        expect(container.querySelector('svg.lucide-folder-lock')).not.toBeNull()
    })
})
