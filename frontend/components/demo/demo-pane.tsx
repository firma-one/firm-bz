'use client'

import { useEffect } from 'react'

/**
 * The tour docks its panes (a deliverable on the Board, the summary review on the Overview) on the
 * right of the window, where its floating "replay the guided tour" button also sits, above
 * everything. While a pane is open, <body data-demo-pane="open"> tells that button to step aside.
 * Returns a cleanup, so it can be an effect's whole body.
 */
export function demoPaneOpen(open: boolean): () => void {
    if (!open) return () => {}
    document.body.dataset.demoPane = 'open'
    return () => { delete document.body.dataset.demoPane }
}

/** Marks the pane open while mounted with `open`; for components that render the pane inline. */
export function DemoPaneMarker({ open }: { open: boolean }) {
    useEffect(() => demoPaneOpen(open), [open])
    return null
}
