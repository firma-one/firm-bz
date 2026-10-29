import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { versions } = vi.hoisted(() => ({
    versions: { revisions: [] as unknown[], loading: false, error: null as string | null, unsupported: false },
}))
vi.mock('@/components/files/use-document-versions', () => ({ useDocumentVersions: () => versions }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => ({ addTask: vi.fn(), updateTask: vi.fn() }) }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { DocumentVersionsTimeline, formatDelta, versionRows, versionTitle } from './document-versions-timeline'

// Oldest first, as both providers list them: OneDrive's, with its own labels.
const REVISIONS = [
    { id: '1.0', label: '1.0', mimeType: '', modifiedTime: '2026-09-24T10:00:00Z', size: '199393', lastModifyingUser: { displayName: 'Deepak Shettigar' } },
    { id: '2.0', label: '2.0', mimeType: '', modifiedTime: '2026-10-28T10:00:00Z', size: '204206', lastModifyingUser: { displayName: 'Ana Lead' } },
]
// Google Drive's: an opaque id, no label.
const GOOGLE_REVISIONS = [
    { id: '0B1x', mimeType: '', modifiedTime: '2026-09-24T10:00:00Z', size: '199393', lastModifyingUser: { displayName: 'Deepak Shettigar' } },
    { id: '0B2y', mimeType: '', modifiedTime: '2026-10-28T15:30:00Z', size: '204206', lastModifyingUser: { displayName: 'Ana Lead' } },
]

beforeEach(() => {
    versions.revisions = REVISIONS
    versions.loading = false
    versions.error = null
    versions.unsupported = false
})

describe('versionRows', () => {
    it("keeps the storage's labels, newest first, and marks the newest as current", () => {
        const rows = versionRows(REVISIONS as never)
        expect(rows.map((r) => [r.label, r.current])).toEqual([['2.0', true], ['1.0', false]])
    })

    it('gives a Google version no label: Drive names none', () => {
        expect(versionRows(GOOGLE_REVISIONS as never).map((r) => r.label)).toEqual([null, null])
    })

    it('works out how much each version changed from the one before', () => {
        const [v2, v1] = versionRows(REVISIONS as never)
        expect(v2.delta).toBe(4813)
        expect(v1.delta).toBeNull()
    })

    it('leaves the change out when a size is unknown', () => {
        const rows = versionRows([{ ...REVISIONS[0], size: undefined }, REVISIONS[1]] as never)
        expect(rows[0].delta).toBeNull()
    })
})

describe('versionTitle', () => {
    it("is OneDrive's version name", () => {
        expect(versionTitle({ label: '2.0', at: '2026-10-28T10:00:00Z' })).toBe('Version 2.0')
    })

    it('is the time a Google version was saved, as Drive shows it', () => {
        const at = '2026-10-28T15:30:00Z'
        expect(versionTitle({ label: null, at })).toBe(new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
        expect(versionTitle({ label: null, at })).toMatch(/^Oct 28, 2026/)
    })
})

describe('formatDelta', () => {
    it('signs the change, and says nothing when there was none', () => {
        expect(formatDelta(4813)).toBe('+4.7 KB')
        expect(formatDelta(-2048)).toBe('−2 KB')
        expect(formatDelta(0)).toBeNull()
        expect(formatDelta(null)).toBeNull()
    })
})

describe('DocumentVersionsTimeline', () => {
    const renderTimeline = () => render(
        <TooltipProvider>
            <DocumentVersionsTimeline document={{ id: 'ext1', name: 'Plan.xlsx' } as never} projectId="p1" />
        </TooltipProvider>,
    )

    it("lists each version on one compact entry under OneDrive's name: who, size and change", () => {
        renderTimeline()
        expect(screen.getByText('Version 2.0')).toBeTruthy()
        expect(screen.getByText('Current')).toBeTruthy()
        expect(screen.getByText('Version 1.0')).toBeTruthy()
        expect(screen.queryByText('v2')).toBeNull()
        expect(screen.getByText(/Ana Lead · 199\.42 KB/)).toBeTruthy()
        expect(screen.getByText('+4.7 KB')).toBeTruthy()
        expect(screen.getAllByRole('button', { name: /Download Version/ })).toHaveLength(2)
    })

    it('names a Google version by the time it was saved, never by a number of ours', () => {
        versions.revisions = GOOGLE_REVISIONS
        renderTimeline()
        expect(screen.getAllByText(/^Oct 28, 2026|^Sep 24, 2026/)).toHaveLength(2)
        expect(screen.queryByText(/^v\d/)).toBeNull()
        expect(screen.getByRole('button', { name: /Download Oct 28, 2026/ })).toBeTruthy()
    })

    it("says so when the storage has no version list, rather than that there are none", () => {
        versions.revisions = []
        versions.unsupported = true
        renderTimeline()
        expect(screen.getByText("Version history isn't available for this storage yet.")).toBeTruthy()
    })
})

describe('DocumentVersionsTimeline and approvals', () => {
    const approval = (extra: object = {}) => ({ id: 'ap', version: { id: '1.0', label: '1.0', savedAt: 'x' }, archived: { fileId: 'c', name: 'n' }, approvedAt: '2026-10-01T10:00:00Z', approvedBy: 'u', ...extra })
    const renderWith = (approvals: unknown[]) => render(
        <TooltipProvider>
            <DocumentVersionsTimeline document={{ id: 'ext1', name: 'Plan.xlsx' } as never} projectId="p1" approvals={approvals as never} />
        </TooltipProvider>,
    )

    it('tags the version that was approved', () => {
        renderWith([approval()])
        expect(screen.getByText('Approved')).toBeTruthy()
    })

    it('tags one reopened since as previously approved', () => {
        renderWith([approval({ unlockedAt: '2026-10-20T10:00:00Z' })])
        expect(screen.getByText('Previously approved')).toBeTruthy()
        expect(screen.queryByText('Approved')).toBeNull()
    })
})
