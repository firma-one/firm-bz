import { describe, it, expect } from 'vitest'
import { assetSettingsOf, buildSettingsForDb, settingsForBrowser } from './sharing-settings'

// A document's own fields survive changes to how it is shared (2026-10-28).

describe('assetSettingsOf', () => {
    it("keeps the document's own fields and drops the sharing state", () => {
        const settings = {
            description: 'Sizing model',
            assigneeUserId: 'u-ana',
            share: { guest: { enabled: true, options: {} }, createdAt: '2026-10-01' },
            activity: { status: 'in_review', updatedAt: '2026-10-02' },
            lock: { type: 'finalize' },
        }
        expect(assetSettingsOf(settings)).toEqual({ description: 'Sizing model', assigneeUserId: 'u-ana' })
    })

    it('is empty for empty or missing settings', () => {
        expect(assetSettingsOf({})).toEqual({})
        expect(assetSettingsOf(null)).toEqual({})
    })
})

describe('buildSettingsForDb', () => {
    const notes = [{ id: 'n1', kind: 'note', body: 'x', authorUserId: 'u', createdAt: '2026-10-28' }]

    it('keeps what it does not manage: the lock, description, assignee and notes', () => {
        const next = buildSettingsForDb(
            { lock: { type: 'private' }, description: 'Sizing model', assigneeUserId: 'u-ana', notes },
            { activity: { status: 'in_progress' } },
        )
        expect(next.lock).toEqual({ type: 'private' })
        expect(next.description).toBe('Sizing model')
        expect(next.assigneeUserId).toBe('u-ana')
        expect(next.notes).toEqual(notes)
        expect((next.activity as { status: string }).status).toBe('in_progress')
    })

    it('folds the legacy flat share keys into share, and drops them', () => {
        const next = buildSettingsForDb({ guest: true, guestOptions: { allowDownload: true }, externalCollaborator: false }, {})
        expect(next).not.toHaveProperty('guest')
        expect(next).not.toHaveProperty('guestOptions')
        expect(next).not.toHaveProperty('externalCollaborator')
        expect((next.share as { guest: { enabled: boolean; options: { allowDownload: boolean } } }).guest).toMatchObject({ enabled: true, options: { allowDownload: true } })
    })
})

describe('settingsForBrowser', () => {
    it('leaves the notes out and everything else in', () => {
        expect(settingsForBrowser({ description: 'd', notes: [{ id: 'n1' }] })).toEqual({ description: 'd' })
    })

    it('passes settings without notes through as they are', () => {
        const s = { description: 'd' }
        expect(settingsForBrowser(s)).toBe(s)
        expect(settingsForBrowser(null)).toBeNull()
    })
})
