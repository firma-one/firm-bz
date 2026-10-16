/**
 * The New UI (see .claude/plans/ui-ux-overhaul.md): the only UI since 2026-10-15. The legacy shell
 * and the per-user "New UI" switch were deleted in the Phase 7 cleanup.
 *
 * `data-ui="v2"` on <html> swaps the semantic tokens in `app/ui-tokens.css` to the Notion-style
 * values and turns on the `v2:` Tailwind variant. The root layout's pre-paint script sets it on
 * `/d` before first paint; `UiShellProvider` keeps it set while the `/d` tree is mounted, so a
 * client-side navigation out to marketing pages never carries the New UI tokens with it.
 *
 * Client-safe: no server imports here.
 */

/** Marks <html> as New UI. Browser only. */
export function applyNewUi(): void {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.ui = 'v2'
}

/** Clears the mark when the `/d` tree unmounts. Browser only. */
export function clearNewUi(): void {
    if (typeof document === 'undefined') return
    delete document.documentElement.dataset.ui
}
