import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MigrationProgressPanel } from './migration-progress-panel'

/** CN-7: Cancel and Unlock read the answer, and say why they didn't work. */

afterEach(() => vi.unstubAllGlobals())

describe('MigrationProgressPanel', () => {
    it("says the migration has already started when Cancel is refused, and doesn't move on", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'The migration has already started.' }), { status: 409 })))
        const onCancelled = vi.fn()
        render(
            <MigrationProgressPanel
                status={{ active: false, migrationPending: { initiatedAt: new Date().toISOString(), estimatedStartMinutes: 2, initiatedBy: 'u1' } } as any}
                firmId="f1"
                accessToken="tok"
                onCancelled={onCancelled}
            />
        )
        fireEvent.click(screen.getByTitle('Cancel migration'))
        expect(await screen.findByText("Couldn't cancel · The migration has already started.")).toBeTruthy()
        expect(onCancelled).not.toHaveBeenCalled()
    })
})
