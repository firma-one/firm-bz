import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// The Board when things fail (EM-3, P1-64): a failed load is never "No deliverables yet", and a demote
// says the server's words, or its "done, but…".

const { toasts, toastApi } = vi.hoisted(() => {
    const toasts: { type: string; title: string; message?: string }[] = []
    // Stable, as the real one is (useCallback in ToastProvider).
    const toastApi = { addToast: (t: { type: string; title: string; message?: string }) => { toasts.push({ type: t.type, title: t.title, message: t.message }) } }
    return { toasts, toastApi }
})

vi.mock('@/lib/supabase', () => ({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'me', email: 'me@firm.test' } } } }) } },
}))
vi.mock('@/components/ui/toast', () => ({
    useToast: () => toastApi,
}))
vi.mock('@/lib/use-secure-open-document', () => ({
    useSecureOpenDocument: () => ({
        handleSecureOpen: vi.fn(), secureModalOpen: false, secureModalMode: 'grant', secureModalData: { email: 'me@firm.test', fileName: 'x', mimeType: null },
        setSecureModalOpen: vi.fn(), isRegrantingId: null, isRegrantLoading: false, regrantError: null, requestNewAccessLink: vi.fn(),
    }),
}))
vi.mock('@/lib/hooks/use-project-persona-labels', () => ({
    useProjectPersonaLabels: () => ({ projExtCollaborator: 'Contributor · Limited Access', projViewer: 'Reviewer' }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
// The card's menu, reduced to the one action under test.
vi.mock('@/components/ui/document-action-menu', () => ({
    DocumentActionMenu: ({ document, onUntagAsDeliverable }: { document: { id: string; name?: string }; onUntagAsDeliverable?: (d: { id: string }) => void }) =>
        <button type="button" onClick={() => onUntagAsDeliverable?.({ id: document.id })}>Demote {document.id}</button>,
}))
vi.mock('@/components/projects/document-doc-comments-pane', () => ({ DocumentDocCommentsPane: () => null }))
vi.mock('./secure-access-modal', () => ({ SecureAccessModal: () => null }))

import { EngagementSharesTab, intakeFailureTitle } from './engagement-shares-tab'
import { TooltipProvider } from '@/components/ui/tooltip'

const SHARE = {
    id: 's1', projectId: 'p1', documentId: 'D1', documentName: 'Market report', documentExternalId: 'ext-D1', documentMimeType: 'application/vnd.google-apps.folder',
    createdBy: 'me', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    settings: { externalCollaborator: false, guest: false, guestOptions: {}, publishedVersionId: null, publishedAt: null },
    activity: { status: 'to_do', updatedAt: '2026-11-01T00:00:00Z' }, accessLog: [],
}

type Answer = { status: number; json: unknown } | 'drop'
let answers: Record<string, Answer[]> = {}
const answerFor = (key: string, a: Answer) => { (answers[key] ??= []).push(a) }

beforeEach(() => {
    toasts.length = 0
    answers = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${url.replace(/^\/api\/projects\/p1/, '')}`
        const queue = answers[key] ?? []
        const a = queue.length > 1 ? queue.shift()! : queue[0]
        if (!a || a === 'drop') throw new TypeError('Failed to fetch')
        return { ok: a.status < 400, status: a.status, json: async () => a.json } as Response
    }))
})
afterEach(() => vi.unstubAllGlobals())

// The app's layout provides the tooltips.
const board = () => render(<TooltipProvider><EngagementSharesTab projectId="p1" canManage roleSlug="eng_admin" /></TooltipProvider>)

describe('the Board, when its load fails (EM-3)', () => {
    it("says it couldn't load, with the server's words, and never that there are no deliverables", async () => {
        answerFor('GET /shares', { status: 500, json: { error: 'Something went wrong on our side. Try again.' } })
        board()
        expect(await screen.findByText("Couldn't load the Board")).toBeTruthy()
        expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy()
        expect(screen.queryByText('No deliverables yet')).toBeNull()
    })

    it('says the request never got there, and loads on Try again', async () => {
        answerFor('GET /shares', 'drop')
        answerFor('GET /shares', { status: 200, json: { shares: [], generalFolderId: null } })
        board()
        expect(await screen.findByText("Couldn't reach firma. Check your connection and try again.")).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
        expect(await screen.findByText('No deliverables yet')).toBeTruthy()
    })
})

describe('demoting from the Board (P1-64)', () => {
    beforeEach(() => answerFor('GET /shares', { status: 200, json: { shares: [SHARE], generalFolderId: null } }))

    it("says the server's words when it refuses, and keeps the card", async () => {
        answerFor('PUT /documents/D1/sharing', { status: 409, json: { error: 'An approved deliverable stays one. Reopen it first.' } })
        board()
        const demote = await screen.findByRole('button', { name: 'Demote D1' })
        await act(async () => { fireEvent.click(demote) })
        await waitFor(() => expect(toasts).toContainEqual({ type: 'error', title: 'Demote failed', message: 'An approved deliverable stays one. Reopen it first.' }))
        expect(screen.getByRole('button', { name: 'Demote D1' })).toBeTruthy()
    })

    it("warns when it's demoted but someone still has access in storage", async () => {
        const warning = 'Demoted, but 2 people still have access in storage · Google Drive refused to remove them.'
        answerFor('PUT /documents/D1/sharing', { status: 200, json: { success: true, warning } })
        board()
        const demote = await screen.findByRole('button', { name: 'Demote D1' })
        await act(async () => { fireEvent.click(demote) })
        await waitFor(() => expect(toasts).toContainEqual({ type: 'warning', title: 'Demoted to folder', message: warning }))
        expect(screen.queryByRole('button', { name: 'Demote D1' })).toBeNull()
    })

    it('says the request never got there', async () => {
        answerFor('PUT /documents/D1/sharing', 'drop')
        board()
        const demote = await screen.findByRole('button', { name: 'Demote D1' })
        await act(async () => { fireEvent.click(demote) })
        await waitFor(() => expect(toasts).toContainEqual({ type: 'error', title: 'Demote failed', message: "Couldn't reach firma. Check your connection and try again." }))
    })
})

describe('intake action titles', () => {
    it('name what was tried', () => {
        expect(intakeFailureTitle('reject')).toBe("Couldn't reject the file")
        expect(intakeFailureTitle('reject-folder')).toBe("Couldn't reject the folder")
        expect(intakeFailureTitle('withdraw')).toBe("Couldn't withdraw the upload")
        expect(intakeFailureTitle('approve-folder')).toBe("Couldn't approve the folder")
    })
})
