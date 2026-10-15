/**
 * UI shell version (see .claude/plans/ui-ux-overhaul.md).
 *
 * `v2` (the Notion/Linear UI) is the only UI since 2026-10-15, when the "New UI" opt-out toggle was
 * removed; `v1` is the legacy UI, still compiled until the old shell is deleted (Phase 7). `v2` sets `data-ui="v2"` on
 * <html>, which swaps the semantic tokens in `app/ui-tokens.css` to the Notion-style values.
 *
 * Source of truth is `user_personalizations.uiPrefs.shell`. The cookie mirrors it only so the root
 * layout's pre-paint script can set the attribute before first paint (no flash of the old UI);
 * `DLayoutClient` re-syncs the cookie from the server value on every `/d` load.
 *
 * Client-safe: no server imports here.
 */

export type UiShell = 'v1' | 'v2'

export const UI_SHELL_COOKIE = 'fm_ui_shell'

/** One year — the cookie is a cache of a server preference, re-synced on every `/d` load. */
export const UI_SHELL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Always the new UI. The opt-out toggle was removed on 2026-10-15, so a stored `v1` preference or
 * cookie no longer applies; the `v1` code paths stay compiled until the Phase 7 cleanup deletes them.
 */
export function normalizeUiShell(_raw: unknown): UiShell {
    return 'v2'
}

/** Applies the shell to <html> and mirrors it into the cookie. Browser only. */
export function applyUiShell(shell: UiShell): void {
    if (typeof document === 'undefined') return
    if (shell === 'v2') document.documentElement.dataset.ui = 'v2'
    else delete document.documentElement.dataset.ui
    document.cookie = `${UI_SHELL_COOKIE}=${shell}; path=/; max-age=${UI_SHELL_COOKIE_MAX_AGE}; samesite=lax`
}
