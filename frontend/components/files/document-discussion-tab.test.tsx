import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { seen } = vi.hoisted(() => ({ seen: { props: null as any } }))
vi.mock('@/components/projects/document-doc-comments-pane', () => ({
    DocumentDocCommentsPane: (props: any) => { seen.props = props; return <div>deliverable thread</div> },
}))

import { DocumentDiscussionTab } from './document-discussion-tab'

let deliverable: unknown = null
let fetched: string[] = []
/** How /deliverable answers: as it should, refused with the server's words, or never arriving. */
let answer: 'ok' | 'refused' | 'drop' = 'ok'

beforeEach(() => {
    deliverable = null
    fetched = []
    seen.props = null
    answer = 'ok'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        fetched.push(url)
        if (url.endsWith('/deliverable')) {
            if (answer === 'drop') throw new TypeError('Failed to fetch')
            if (answer === 'refused') return { ok: false, status: 500, json: async () => ({ error: "Couldn't find the deliverable this file is in, on our side. Try again." }) } as Response
            return { ok: true, json: async () => ({ deliverable }) } as Response
        }
        if (url.endsWith('/subtasks')) return { ok: true, json: async () => ({ subtasks: [{ documentId: 'doc-1', docId: 'QSR-16', fileName: 'Budget.xlsx' }] }) } as Response
        return { ok: false, json: async () => ({}) } as Response
    }))
})

describe('DocumentDiscussionTab', () => {
    it("opens the deliverable's thread about this file, a new comment starting with its tag", async () => {
        deliverable = { id: 'deliv-1', docId: 'QSR-9', name: 'Market report' }
        render(<DocumentDiscussionTab projectId="p1" documentId="doc-1" docId="QSR-16" />)
        await waitFor(() => expect(screen.getByText('deliverable thread')).toBeTruthy())
        expect(screen.getByText('QSR-9 · Market report')).toBeTruthy()
        expect(seen.props).toMatchObject({ documentId: 'deliv-1', initialDraft: '#QSR-16 ', focusDocId: 'QSR-16' })
        await waitFor(() => expect(seen.props.taggableDocuments).toHaveLength(1))
    })

    it("doesn't load the deliverable's document list for a client", async () => {
        deliverable = { id: 'deliv-1', docId: 'QSR-9', name: 'Market report' }
        render(<DocumentDiscussionTab projectId="p1" documentId="doc-1" docId="QSR-16" isExternalUser />)
        await waitFor(() => expect(screen.getByText('deliverable thread')).toBeTruthy())
        expect(fetched.some((u) => u.endsWith('/subtasks'))).toBe(false)
    })

    it('explains that a file outside any deliverable is discussed by tagging it', async () => {
        render(<DocumentDiscussionTab projectId="p1" documentId="doc-1" docId="QSR-16" />)
        await waitFor(() => expect(screen.getByText(/isn't in one/)).toBeTruthy())
        expect(screen.getByText('#QSR-16')).toBeTruthy()
    })

    // P1-73: a failed load isn't "this file isn't in one".
    it('says it could not load the discussion, with the reason and a way to try again', async () => {
        answer = 'refused'
        render(<DocumentDiscussionTab projectId="p1" documentId="doc-1" docId="QSR-16" />)
        await waitFor(() => expect(screen.getByText("Couldn't load this discussion")).toBeTruthy())
        expect(screen.getByText(/on our side/)).toBeTruthy()
        expect(screen.queryByText(/isn't in one/)).toBeNull()

        answer = 'ok'
        deliverable = { id: 'deliv-1', docId: 'QSR-9', name: 'Market report' }
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(screen.getByText('deliverable thread')).toBeTruthy())
    })

    it('says a dropped connection is why', async () => {
        answer = 'drop'
        render(<DocumentDiscussionTab projectId="p1" documentId="doc-1" docId="QSR-16" />)
        await waitFor(() => expect(screen.getByText(/Couldn't reach/)).toBeTruthy())
        expect(screen.queryByText(/isn't in one/)).toBeNull()
    })
})
