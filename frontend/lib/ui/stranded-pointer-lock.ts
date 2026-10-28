/**
 * Gives the page its clicks back when a closed menu or dialog left them switched off.
 *
 * While a modal Radix layer (menu, dialog) is open it sets `pointer-events: none` on <body>, and
 * restores the old value when the last such layer unmounts — after its closing animation. Opening a
 * file from the ⋮ menu opens a new tab on the click and a dialog with it; the tab hides this page,
 * the animations pause, and the restore can be lost, leaving the whole page unclickable with nothing
 * on screen to close (2026-10-28).
 *
 * Only acts when no menu or dialog is actually open, so it never unlocks a live modal.
 */

const OPEN_MODAL_LAYER = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
].join(',')

export function releaseStrandedPointerLock(doc: Document = document): boolean {
    if (doc.body.style.pointerEvents !== 'none') return false
    if (doc.querySelector(OPEN_MODAL_LAYER)) return false
    doc.body.style.pointerEvents = ''
    return true
}
