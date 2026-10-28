import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { pane, sw } = vi.hoisted(() => ({
  pane: {
    setContent: vi.fn(), clearPane: vi.fn(), setTitle: vi.fn(), setHeaderIcon: vi.fn(),
    setHeaderSubtitle: vi.fn(), setHeaderActions: vi.fn(), setExpanded: vi.fn(),
  },
  sw: { tabs: true },
}))

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => pane }))
vi.mock('@/components/files/details-pane-switch', () => ({ get DETAILS_PANE_TABS() { return sw.tabs } }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => ({ addTask: vi.fn(), updateTask: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))

import { DocumentActionMenu } from './document-action-menu'

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
  sw.tabs = true
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

describe('DocumentActionMenu — the Details submenu behind the switch', () => {
  beforeEach(() => { sw.tabs = false })

  /** Opens Details and returns the names of what is in it. */
  async function detailsItems() {
    await openMenu()
    const trigger = screen.getByRole('menuitem', { name: /Details/ })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    await screen.findByRole('menuitem', { name: /File information/ })
    return screen.getAllByRole('menuitem').map((el) => el.textContent?.trim())
  }

  it('shows Activity stream and Version history to the firm on a file', async () => {
    render(<DocumentActionMenu document={FILE} projectId="e1" />)
    const items = await detailsItems()
    expect(items).toContain('Activity stream')
    expect(items).toContain('Version history')
  })

  it('leaves them out for an external user, whom the versions route refuses', async () => {
    render(<DocumentActionMenu document={FILE} projectId="e1" isExternalUser />)
    const items = await detailsItems()
    expect(items).toContain('File information')
    expect(items).not.toContain('Activity stream')
    expect(items).not.toContain('Version history')
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
