import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { pane, addToast, tasks } = vi.hoisted(() => ({
  pane: {
    setContent: vi.fn(), clearPane: vi.fn(), setTitle: vi.fn(), setHeaderIcon: vi.fn(),
    setHeaderSubtitle: vi.fn(), setHeaderActions: vi.fn(), setExpanded: vi.fn(),
  },
  addToast: vi.fn(),
  tasks: { addTask: vi.fn(() => 'task-1'), updateTask: vi.fn() },
}))

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => pane }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => tasks }))
vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))

import { DocumentActionMenu, reminderOutcomeText } from './document-action-menu'

const FILE = { id: 'f1', name: 'podcast-ep04.jpg', mimeType: 'image/jpeg', documentType: 'FILE' } as any

/** Opens the menu from its trigger, as the keyboard does. */
async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'More actions' })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  Object.values(pane).forEach((fn) => fn.mockReset())
  addToast.mockReset()
  tasks.updateTask.mockReset()
})

describe('DocumentActionMenu — Details as one tabbed pane', () => {
  it('is a single item, not a submenu, and opens the Details pane', async () => {
    render(<DocumentActionMenu document={FILE} projectId="e1" />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /File information/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Details$/ }))
    // Titled as the Board's pane: the doc ID, else the name.
    expect(pane.setTitle).toHaveBeenCalledWith('podcast-ep04.jpg')
    expect(pane.setContent).toHaveBeenCalledTimes(1)
  })

  it('opens it for an external user too, whose tabs leave out Versions and Activity', async () => {
    render(<DocumentActionMenu document={FILE} projectId="e1" isExternalUser />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Details$/ }))
    const node = pane.setContent.mock.calls[0][0] as { props: { isExternalUser: boolean } }
    expect(node.props.isExternalUser).toBe(true)
  })
})

describe('DocumentActionMenu — items that open a dialog', () => {
  it('Move to trash closes the menu, so it cannot cover the confirmation', async () => {
    const onDelete = vi.fn()
    const onOpenChange = vi.fn()
    render(<DocumentActionMenu document={FILE} onDeleteDocument={onDelete} onOpenChange={onOpenChange} />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to trash/ }))
    expect(onDelete).toHaveBeenCalledWith(FILE)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('Promote Folder to Deliverable closes the menu and shows its dialog', async () => {
    render(<DocumentActionMenu document={{ ...FILE, mimeType: 'application/vnd.google-apps.folder' }} canManage showShareModal projectId="e1" onMarkAsDeliverable={vi.fn()} />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Promote Folder to Deliverable/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('dialog').textContent).toContain('Promote Folder to Deliverable')
    // Closing the dialog leaves the page clickable: no layer is left blocking pointer events.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.pointerEvents).toBe('')
  })
})

describe('DocumentActionMenu — failures say why', () => {
  it("a refused download carries the route's reason to the Downloads tray", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/bookmarks'
      ? new Response(JSON.stringify({ bookmarks: [] }))
      : new Response(JSON.stringify({ error: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.', code: 'reconnect' }), { status: 502 })))
    render(<DocumentActionMenu document={FILE} projectId="e1" />)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Download/ }))
    await waitFor(() => expect(tasks.updateTask).toHaveBeenCalledWith('task-1', {
      status: 'error',
      error: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.',
    }))
    vi.unstubAllGlobals()
  })

  it('Copy name says so when the browser refuses the clipboard, instead of "Copied"', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied') }) }, configurable: true })
    render(<DocumentActionMenu document={FILE} projectId="e1" />)
    await openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Copy name' }))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: "Couldn't copy" })))
  })
})

describe('reminderOutcomeText', () => {
  it('names who it worked for, and who it did not and why', () => {
    const members = [{ userId: 'a', name: 'Ana' }, { userId: 'r', name: 'Raj' }]
    expect(reminderOutcomeText([
      { userId: 'a', kind: 'set', error: null },
      { userId: 'r', kind: 'set', error: 'Reminders cannot be assigned to an assistant' },
    ], members)).toBe("Reminder set for Ana. Couldn't set it for Raj · Reminders cannot be assigned to an assistant.")
  })
})
