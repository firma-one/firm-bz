import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'

/**
 * Brio's file panels when something fails: the request that never left says nothing was changed,
 * a review whose model turn failed doesn't read as "Nothing to change", and the folder setup names
 * each folder it couldn't create, with why. No Drive is involved: fetch is stubbed.
 */

const { auth } = vi.hoisted(() => ({ auth: { session: { access_token: 't' } } }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))

import { FilesAgentPanel, useFilesReview, type FilesAgentReview } from './files-agent-panel'
import { scaffoldOutcome } from './files-scaffold-panel'

afterEach(() => vi.unstubAllGlobals())

const REVIEW: FilesAgentReview = {
    findings: [{ kind: 'duplicate', fileCount: 2, files: [] }] as never,
    proposals: [],
    token: null,
    nodeCount: 4,
    creditsSpent: 1,
    dropped: 0,
    truncated: false,
    estimate: 1,
}

describe('useFilesReview', () => {
    it('a review that never reached Brio says so, and that nothing changed', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        const { result } = renderHook(() => useFilesReview({ projectId: 'p1', setReview: vi.fn() }))
        await act(async () => { await result.current.runReview() })
        expect(result.current.error).toBe("Couldn't reach Brio. Nothing was changed.")
    })

    it('a refused review shows the route’s words', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "You have used this month's 500 AI credits." }) })))
        const { result } = renderHook(() => useFilesReview({ projectId: 'p1', setReview: vi.fn() }))
        await act(async () => { await result.current.runReview() })
        expect(result.current.error).toBe("You have used this month's 500 AI credits.")
    })
})

describe('FilesAgentPanel after a failed model turn', () => {
    it('says Brio couldn’t finish, not "Nothing to change"', () => {
        render(<FilesAgentPanel projectId="p1" review={{ ...REVIEW, modelFailed: true }} setReview={vi.fn()} runReview={vi.fn()} />)
        expect(screen.getByText("Couldn't finish")).toBeTruthy()
        expect(screen.queryByText('Nothing to change')).toBeNull()
        expect(screen.getByText(/Brio couldn't finish suggesting changes, so some findings have none\./)).toBeTruthy()
    })

    it('a clean run with nothing to suggest still says so', () => {
        render(<FilesAgentPanel projectId="p1" review={REVIEW} setReview={vi.fn()} runReview={vi.fn()} />)
        expect(screen.getByText('Nothing to change')).toBeTruthy()
    })
})

describe('scaffoldOutcome', () => {
    it('names each folder not created, with its reason', () => {
        const out = scaffoldOutcome({
            created: 4, failed: 2, total: 6,
            failures: [
                { path: '01_Planning', name: '01_Planning', reason: 'Google Drive is busy right now. Try again in a minute.' },
                { path: '01_Planning/Notes', name: 'Notes', reason: "Not created, because the folder it goes in couldn't be created." },
            ],
        })
        expect(out.ok).toBe(false)
        expect(out.message).toBe([
            'Created 4 of 6 folders. Not created:',
            '- 01_Planning: Google Drive is busy right now. Try again in a minute.',
            "- 01_Planning/Notes: Not created, because the folder it goes in couldn't be created.",
        ].join('\n'))
    })

    it('nothing created is a failure, not a partial success', () => {
        const out = scaffoldOutcome({ created: 0, failed: 1, total: 1, failures: [{ path: 'A', name: 'A', reason: "Couldn't create this folder." }] })
        expect(out.ok).toBe(false)
        expect(out.message.startsWith("Couldn't create the folders, so nothing was created.")).toBe(true)
    })

    it('all created reads as done', () => {
        expect(scaffoldOutcome({ created: 3, failed: 0, total: 3 })).toEqual({
            ok: true,
            message: 'Created 3 folders, recorded in the audit trail as Brio, your Executive Assistant.',
        })
    })
})
