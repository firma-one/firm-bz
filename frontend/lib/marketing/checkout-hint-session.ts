/**
 * Session-only UI flags for the checkout hint strip + profile Joyride.
 * Cleared on sign-out so the hint can appear again after the next login (same browser tab gets fresh sessionStorage only after tab close — we explicitly clear on logout).
 */

const HINT_DISMISSED_KEY = 'firma.checkoutHintDismissedSession'
const PROFILE_JOYRIDE_DONE_KEY = 'firma.checkoutProfileJoyrideDoneSession'

function safeGet(key: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.sessionStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSet(key: string, value: string): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(key, value)
    } catch {
        /* private mode */
    }
}

function safeRemove(key: string): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.removeItem(key)
    } catch {
        /* ignore */
    }
}

export function readCheckoutHintDismissedSession(): boolean {
    return safeGet(HINT_DISMISSED_KEY) === '1'
}

export function setCheckoutHintDismissedSession(): void {
    safeSet(HINT_DISMISSED_KEY, '1')
}

export function readCheckoutProfileJoyrideDoneSession(): boolean {
    return safeGet(PROFILE_JOYRIDE_DONE_KEY) === '1'
}

export function setCheckoutProfileJoyrideDoneSession(): void {
    safeSet(PROFILE_JOYRIDE_DONE_KEY, '1')
}

/** Call on sign-out (and SIGNED_OUT) so the next login shows the hint again. */
export function clearCheckoutHintSessionKeys(): void {
    safeRemove(HINT_DISMISSED_KEY)
    safeRemove(PROFILE_JOYRIDE_DONE_KEY)
}
