import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * P1-28: one sentence per code, never a raw code. P1-29: a blocked or closed popup says so instead
 * of spinning for two minutes. P1-30: a connector already active in another firm doesn't end the wait.
 */

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { googleDriveOAuthPopupFailureMessage, startGoogleDriveOAuthPopup } from './google-drive-popup-oauth'
import { oneDriveOAuthPopupFailureMessage } from './onedrive-popup-oauth'

function handlers() {
    return {
        getAccessToken: vi.fn(async () => 'tok'),
        onMessageSuccess: vi.fn(),
        onPollSuccess: vi.fn(),
        onMessageFailure: vi.fn(),
        onTimeout: vi.fn(),
        onFlowEnd: vi.fn(),
    }
}

describe('failure messages', () => {
    it('words every code the callbacks send, and never shows the code', () => {
        for (const code of ['session_mismatch', 'invalid_state', 'forbidden', 'database_error', 'no_code', 'no_user_id', 'callback_error', 'reconnect_failed', 'popup_blocked', 'popup_closed']) {
            const m = googleDriveOAuthPopupFailureMessage(code)
            expect(m).not.toContain(code)
            expect(m).toMatch(/\.$/)
        }
        expect(googleDriveOAuthPopupFailureMessage('something_new')).toBe("Connecting Google Drive didn't finish. Try again.")
    })

    it("says a Microsoft admin must approve, and carries Microsoft's own sentence", () => {
        expect(oneDriveOAuthPopupFailureMessage('admin_consent_required')).toMatch(/^Your Microsoft admin needs to approve /)
        expect(oneDriveOAuthPopupFailureMessage('oauth_error', 'User account does not exist in tenant')).toBe(
            "Microsoft sign-in didn't finish · User account does not exist in tenant."
        )
    })
})

describe('startGoogleDriveOAuthPopup', () => {
    let statusAnswer: { isConnected: boolean; connector: { id: string } | null }

    beforeEach(() => {
        vi.useFakeTimers()
        statusAnswer = { isConnected: false, connector: null }
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(statusAnswer))))
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('says the browser blocked the window when it never opened', async () => {
        vi.spyOn(window, 'open').mockReturnValue(null)
        const h = handlers()
        startGoogleDriveOAuthPopup('https://accounts.google.com/x', 'n', h)
        await vi.advanceTimersByTimeAsync(10)
        expect(h.onFlowEnd).toHaveBeenCalled()
        expect(h.onMessageFailure).toHaveBeenCalledWith('popup_blocked')
    })

    it('says the window closed when it closes without an answer', async () => {
        const popup = { closed: false }
        vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
        const h = handlers()
        startGoogleDriveOAuthPopup('https://accounts.google.com/x', 'n', h)
        await vi.advanceTimersByTimeAsync(1000)
        popup.closed = true
        await vi.advanceTimersByTimeAsync(3000)
        expect(h.onMessageFailure).toHaveBeenCalledWith('popup_closed')
        expect(h.onTimeout).not.toHaveBeenCalled()
    })

    it("doesn't end the wait for a connector that was already active elsewhere", async () => {
        statusAnswer = { isConnected: true, connector: { id: 'other-firm-conn' } }
        vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window)
        const h = handlers()
        startGoogleDriveOAuthPopup('https://accounts.google.com/x', 'n', h, { priorConnectorIds: [] })
        await vi.advanceTimersByTimeAsync(7000)
        expect(h.onPollSuccess).not.toHaveBeenCalled()
        expect(h.onFlowEnd).not.toHaveBeenCalled()
        // A genuinely new connector still ends it.
        statusAnswer = { isConnected: true, connector: { id: 'new-conn' } }
        await vi.advanceTimersByTimeAsync(2500)
        expect(h.onPollSuccess).toHaveBeenCalledWith({ id: 'new-conn', name: null })
    })

    it("hands the provider's sentence to onMessageFailure", async () => {
        vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window)
        const h = handlers()
        startGoogleDriveOAuthPopup('https://accounts.google.com/x', 'n', h)
        window.dispatchEvent(
            new MessageEvent('message', {
                origin: window.location.origin,
                data: { type: 'google_drive_oauth', ok: false, error: 'oauth_error', errorDescription: 'Org policy', nonce: 'n' },
            })
        )
        await vi.advanceTimersByTimeAsync(10)
        expect(h.onMessageFailure).toHaveBeenCalledWith('oauth_error', 'Org policy')
    })
})
