import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { versions } = vi.hoisted(() => ({
    versions: { revisions: [] as unknown[], loading: false, error: null as string | null, unsupported: false },
}))
vi.mock('@/components/files/use-document-versions', () => ({ useDocumentVersions: () => versions }))
vi.mock('@/lib/download-progress-context', () => ({ useDownloadProgress: () => ({ addTask: vi.fn(), updateTask: vi.fn() }) }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { DocumentVersionsTimeline, formatDelta, versionRows } from './document-versions-timeline'

// Oldest first, as both providers list them.
const REVISIONS = [
    { id: '1.0', mimeType: '', modifiedTime: '2026-09-24T10:00:00Z', size: '199393', lastModifyingUser: { displayName: 'Deepak Shettigar' } },
    { id: '2.0', mimeType: '', modifiedTime: '2026-10-28T10:00:00Z', size: '204206', lastModifyingUser: { displayName: 'Ana Lead' } },
]

beforeEach(() => {
    versions.revisions = REVISIONS
    versions.loading = false
    versions.error = null
    versions.unsupported = false
})

describe('versionRows', () => {
    it('numbers every version, newest first, and marks the newest as current', () => {
        const rows = versionRows(REVISIONS as never)
        expect(rows.map((r) => [r.number, r.current])).toEqual([[2, true], [1, false]])
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

    it('lists each version on one compact entry: number, who, size and change', () => {
        renderTimeline()
        expect(screen.getByText('v2')).toBeTruthy()
        expect(screen.getByText('Current')).toBeTruthy()
        expect(screen.getByText('v1')).toBeTruthy()
        expect(screen.getByText(/Ana Lead · 199\.42 KB/)).toBeTruthy()
        expect(screen.getByText('+4.7 KB')).toBeTruthy()
        expect(screen.getAllByRole('button', { name: /Download v/ })).toHaveLength(2)
    })

    it("says so when the storage has no version list, rather than that there are none", () => {
        versions.revisions = []
        versions.unsupported = true
        renderTimeline()
        expect(screen.getByText("Version history isn't available for this storage yet.")).toBeTruthy()
    })
})
