import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ setContent: vi.fn(), clearPane: vi.fn() }) }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => ({ addTask: vi.fn(), updateTask: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))

import { DocumentActionMenu } from './document-action-menu'

const FILE = { id: 'f1', name: 'podcast-ep04.jpg', mimeType: 'image/jpeg', documentType: 'FILE' } as any

/** Opens the menu from its trigger, as the keyboard does. */
async function openMenu() {
  const trigger = screen.getByTitle('More actions')
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

describe('DocumentActionMenu — items that open a dialog', () => {
  it('Move to Bin closes the menu, so it cannot cover the confirmation', async () => {
    const onDelete = vi.fn()
    const onOpenChange = vi.fn()
    render(<DocumentActionMenu document={FILE} onDeleteDocument={onDelete} onOpenChange={onOpenChange} />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to Bin/ }))
    expect(onDelete).toHaveBeenCalledWith(FILE)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('Promote as Deliverable closes the menu and shows its dialog', async () => {
    render(<DocumentActionMenu document={{ ...FILE, mimeType: 'application/vnd.google-apps.folder' }} canManage showShareModal projectId="e1" onMarkAsDeliverable={vi.fn()} />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Promote as Deliverable/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('dialog').textContent).toContain('Promote as Deliverable')
    // Closing the dialog leaves the page clickable: no layer is left blocking pointer events.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.pointerEvents).toBe('')
  })
})
