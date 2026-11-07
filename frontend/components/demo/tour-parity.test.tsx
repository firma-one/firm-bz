import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// /tour is a static copy of the app (.claude/plans/tour-parity.md). This renders the app's Files row and
// the tour's side by side, in the same state, and compares what a person sees: which actions, with which
// icons, in which order. A change to one that doesn't reach the other fails here.

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => ({ addTask: vi.fn(), updateTask: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/files/asset-details-pane', () => ({ openAssetDetailsPane: vi.fn(), ApprovalList: () => null }))
// The row's Status, Due and Assignee cells: what they show is another round's check.
vi.mock('@/components/projects/file-property-cells', () => ({ FileAssigneeCell: () => null, FileDueDateCell: () => null, FileStatusCell: () => null }))

const { pane } = vi.hoisted(() => ({
    pane: {
        content: null, setContent: vi.fn(), clearPane: vi.fn(), setTitle: vi.fn(), setHeaderIcon: vi.fn(), setIconTooltip: vi.fn(),
        setHeaderSubtitle: vi.fn(), setHeaderActions: vi.fn(), setPaneSize: vi.fn(), setExpanded: vi.fn(),
    },
}))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => pane }))

import { EngagementFileRow, type EngagementFileRowProps } from '@/components/projects/engagement-file-row'
import { FileTableHeaderCells } from '@/components/projects/file-table-header-cells'
import { DemoFileList } from './demo-file-list'
import type { DemoFolder } from '@/lib/demo/static-demo-data'

/**
 * Where the tour differs from the app on purpose. Everything else has to match, so a new difference fails
 * until someone decides it belongs here.
 */
const ON_PURPOSE: [RegExp, string][] = [
    // The tour's storage is fixed, so its Open says which; the app's tooltip does that.
    [/^Open in Google Drive$/, 'Open'],
    // The tour names the row in its menu button; the app's is "More actions".
    [/^Actions for .*/, 'More actions'],
]
const asTheAppSaysIt = (label: string) => ON_PURPOSE.reduce((text, [from, to]) => text.replace(from, to), label)

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_NAME = 'Plan.xlsx'
const empty = new Set<string>()

// ── The same state, on each side ─────────────────────────────────────────────

/** The app's row, as a firm lead sees it. */
function renderAppRow(file: Record<string, unknown>, overrides: Partial<EngagementFileRowProps> = {}) {
    const noop = vi.fn()
    const props = {
        file: { projectDocumentId: 'd1', documentType: 'FILE', ...file },
        isSelected: false, selectedFileIdsSize: 0, canEdit: true, canManage: true, isProjectLead: true, loading: false,
        activeCommentDocId: null, activeInfoDocId: null, activePreviewDocId: null, highlightedFileId: null,
        draggedItem: null, dragOverFolderId: null, restrictToSharedOnly: false, viewAsPersonaSlug: null,
        currentFolderType: 'general', generalFolderId: 'g', projectId: 'p', orgSlug: 'firm', isActionMenuOpen: false, isRegrantingId: null,
        sharedExternalIds: empty, ancestorFolderIds: empty, sharedExternalIdsForEC: empty, ancestorFolderIdsForEC: empty,
        sharedExternalIdsForGuest: empty, ancestorFolderIdsForGuest: empty, descendantIds: empty, descendantIdsForEC: empty,
        descendantIdsForGuest: empty, processingFileIds: empty, roleSlug: 'eng_admin',
        onToggleSelect: noop, onClearHighlight: noop, onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDragLeave: noop, onDrop: noop,
        onItemClick: noop, onActionMenuOpenChange: noop, onOpenComments: noop, onOpenRename: noop, onDuplicate: noop, onOpenCopyMove: noop,
        onOpenCrossEngagement: noop, onTrash: noop, onPrivacy: noop, onShareSaved: noop, onMarkAsDeliverable: noop, onUntagAsDeliverable: noop,
        onUnlockConfirm: noop, onOpenDocument: noop, onOpenCommentPane: noop, onOpenInfoPane: noop, onOpenPreviewPane: noop, onAddToast: noop,
        ...overrides,
    } as unknown as EngagementFileRowProps
    return render(<TooltipProvider><EngagementFileRow {...props} /></TooltipProvider>).container
}

const TOUR_FOLDERS: DemoFolder[] = [
    {
        id: 'deliverable', docId: 'QGT-1', name: 'Report',
        subfolders: [{ id: 'inner', docId: 'QGT-2', name: 'Workings', subfolders: [], files: [] }],
        files: [
            { id: 'f1', docId: 'QGT-3', name: FILE_NAME, type: 'xlsx', modifiedTime: '2026-10-19T00:00:00Z', size: 1024 },
            { id: 'f2', docId: 'QGT-4', name: 'Secret.xlsx', type: 'xlsx', modifiedTime: '2026-10-19T00:00:00Z', size: 1024, private: true },
        ],
    },
    { id: 'plain', docId: 'QGT-5', name: 'Reference', subfolders: [], files: [] },
]

/** The tour's list; `into` opens a folder first, as clicking it does. */
function renderTour(into?: string) {
    const { container } = render(
        <TooltipProvider>
            <DemoFileList folders={TOUR_FOLDERS} deliverableStatusByFolderId={{ deliverable: 'in_progress' }} deliverableDueByFolderId={{ deliverable: null }} />
        </TooltipProvider>,
    )
    if (into) fireEvent.click(screen.getByText(into))
    return container
}

// ── Reading what a person sees ───────────────────────────────────────────────

const iconOf = (el: Element) => {
    const svg = el.querySelector('svg')
    if (!svg) return 'no icon'
    // A provider's logo isn't a lucide icon.
    return svg.getAttribute('class')?.match(/lucide-([a-z0-9-]+)/)?.[1] ?? 'custom icon'
}

const rowOf = (container: Element, name: string) => {
    const label = within(container as HTMLElement).getByText(name)
    return label.closest('.group') as HTMLElement
}

/** The row's actions beside its name, in order: its marks, its quick actions and the ⋮ button. */
const quickActions = (row: HTMLElement) =>
    Array.from((row.querySelector('.col-span-3') as HTMLElement).querySelectorAll('button'))
        .map((button) => `${asTheAppSaysIt(button.getAttribute('aria-label') ?? button.textContent ?? '')} · ${iconOf(button)}`)

const menuTrigger = (row: HTMLElement) =>
    Array.from(row.querySelectorAll('button')).find((b) => asTheAppSaysIt(b.getAttribute('aria-label') ?? '') === 'More actions') as HTMLElement

const readLines = (menu: Element, indent = '') =>
    Array.from(menu.querySelectorAll('[role="menuitem"],[role="separator"]')).map((el) => {
        if (el.getAttribute('role') === 'separator') return `${indent}---`
        const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        return `${indent}${label} · ${iconOf(el)}`
    })

/** The whole ⋮ menu, submenus included, one line per item. */
async function readMenu(row: HTMLElement): Promise<string[]> {
    const trigger = menuTrigger(row)
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const menu = await screen.findByRole('menu')

    const lines: string[] = []
    for (const el of Array.from(menu.querySelectorAll('[role="menuitem"],[role="separator"]'))) {
        lines.push(...readLines({ querySelectorAll: () => [el] } as unknown as Element))
        // Due's submenu is a date picker, not a list of actions.
        if (el.getAttribute('aria-haspopup') !== 'menu' || (el.textContent ?? '').startsWith('Due')) continue
        ;(el as HTMLElement).focus()
        fireEvent.keyDown(el, { key: 'ArrowRight' })
        await waitFor(() => expect(screen.getAllByRole('menu').length).toBeGreaterThan(1))
        const sub = screen.getAllByRole('menu').at(-1) as HTMLElement
        lines.push(...readLines(sub, '  '))
        fireEvent.keyDown(sub, { key: 'ArrowLeft' })
        await waitFor(() => expect(screen.getAllByRole('menu')).toHaveLength(1))
    }
    return lines
}

/** Which column each of a grid's cells is, by the breakpoint that shows it. */
const columnsOf = (grid: Element) =>
    Array.from(grid.children).map((cell) => {
        const className = cell.getAttribute('class') ?? ''
        if (className.includes('col-span-3')) return 'name'
        const breakpoint = className.match(/@\[(\d+)rem\]/)?.[1]
        return breakpoint ? `@${breakpoint}` : 'fixed'
    })

/** The app's rows and the tour's, for one kind of row. */
const KINDS: { kind: string; app: () => HTMLElement; tour: () => HTMLElement }[] = [
    {
        kind: 'a document inside a deliverable',
        app: () => rowOf(renderAppRow({ id: 'f1', name: FILE_NAME, mimeType: 'application/vnd.ms-excel' }, { inDeliverableFolder: true }), FILE_NAME),
        tour: () => rowOf(renderTour('Report'), FILE_NAME),
    },
    {
        kind: 'a folder inside a deliverable',
        app: () => rowOf(renderAppRow({ id: 'inner', name: 'Workings', mimeType: FOLDER_MIME }, { inDeliverableFolder: true }), 'Workings'),
        tour: () => rowOf(renderTour('Report'), 'Workings'),
    },
    {
        kind: 'a deliverable',
        app: () => rowOf(renderAppRow(
            { id: 'deliverable', name: 'Report', mimeType: FOLDER_MIME, isDeliverable: true, deliverableStatus: 'in_progress' },
            { sharedExternalIds: new Set(['deliverable']) },
        ), 'Report'),
        tour: () => rowOf(renderTour(), 'Report'),
    },
    {
        kind: 'a plain folder',
        app: () => rowOf(renderAppRow({ id: 'plain', name: 'Reference', mimeType: FOLDER_MIME }), 'Reference'),
        tour: () => rowOf(renderTour(), 'Reference'),
    },
]

beforeEach(() => {
    // The ⋮ menu asks whether the file is bookmarked as it opens.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    Element.prototype.scrollIntoView = vi.fn()
})

describe.each(KINDS)('$kind', ({ app, tour }) => {
    it('has the same quick actions in the same order', () => {
        const inApp = quickActions(app())
        cleanup()
        expect(quickActions(tour())).toEqual(inApp)
    })

    it('has the same ⋮ menu', async () => {
        const inApp = await readMenu(app())
        cleanup()
        expect(await readMenu(tour())).toEqual(inApp)
    })
})

describe('Make internal only', () => {
    const offers = async (row: HTMLElement) => (await readMenu(row)).some((line) => line.includes('Make internal only'))

    it.each(KINDS.map(({ kind, app, tour }) => [kind, app, tour] as const))('is offered only inside a deliverable: %s', async (kind, app, tour) => {
        const inside = kind.includes('inside a deliverable')
        expect(await offers(app())).toBe(inside)
        cleanup()
        expect(await offers(tour())).toBe(inside)
    })

    it('is not offered for a file outside any deliverable', async () => {
        expect(await offers(rowOf(renderAppRow({ id: 'loose', name: 'Loose.xlsx', mimeType: 'application/vnd.ms-excel' }), 'Loose.xlsx'))).toBe(false)
    })

    it('can still be removed from a file marked outside a deliverable', async () => {
        const menu = await readMenu(rowOf(renderAppRow({ id: 'loose', name: 'Loose.xlsx', mimeType: 'application/vnd.ms-excel', isPrivate: true }), 'Loose.xlsx'))
        expect(menu.some((line) => line.includes('Remove internal only'))).toBe(true)
    })
})

describe('the Files table', () => {
    it("keeps each row's cells in the header's order, in the app and on the tour", () => {
        const { container } = render(<div data-testid="header"><FileTableHeaderCells /></div>)
        // The header's cells follow its checkbox.
        const header = ['fixed', ...columnsOf(container.querySelector('[data-testid="header"]') as Element)]
        cleanup()

        const appRow = rowOf(renderAppRow({ id: 'f1', name: FILE_NAME, mimeType: 'application/vnd.ms-excel' }), FILE_NAME)
        expect(columnsOf(appRow)).toEqual(header)
        cleanup()

        const tourRow = rowOf(renderTour('Report'), FILE_NAME)
        expect(columnsOf(tourRow)).toEqual(header)
    })
})

describe('the internal only mark', () => {
    it('reads the same in the app and on the tour', () => {
        const inApp = quickActions(rowOf(renderAppRow({ id: 'f2', name: 'Secret.xlsx', mimeType: 'application/vnd.ms-excel', isPrivate: true }, { inDeliverableFolder: true }), 'Secret.xlsx'))
        cleanup()
        const onTour = quickActions(rowOf(renderTour('Report'), 'Secret.xlsx'))
        expect(onTour[0]).toBe('Internal only. Click to remove · lock')
        expect(onTour).toEqual(inApp)
    })
})
