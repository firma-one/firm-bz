/** How many folders below the engagement root the Files breadcrumb shows before it folds the middle away. */
export const BREADCRUMB_MAX_SHOWN = 5
/** How many of the deepest folders stay on the breadcrumb once it folds. */
export const BREADCRUMB_TAIL = 3

export type TrailEntry<T> = { item: T; index: number }
export type TrailSlot<T> =
    | ({ kind: 'crumb' } & TrailEntry<T>)
    | { kind: 'folded'; entries: TrailEntry<T>[] }

/**
 * Lays out the folders below the engagement root (the root crumb always shows on its own). A short
 * trail shows every folder; a deeper one keeps the last three and folds the ones above them into a
 * single "…" menu, in order, so every level stays one click away and none silently drops out.
 * `index` is each folder's place in `folders` plus `offset` — pass 1 when `folders` follows the
 * root crumb in the same trail, so it indexes that trail.
 */
export function foldBreadcrumbTrail<T>(folders: readonly T[], offset = 0): TrailSlot<T>[] {
    const entries = folders.map((item, i) => ({ item, index: i + offset }))
    if (entries.length <= BREADCRUMB_MAX_SHOWN) return entries.map((e) => ({ kind: 'crumb' as const, ...e }))
    const cut = entries.length - BREADCRUMB_TAIL
    return [
        { kind: 'folded', entries: entries.slice(0, cut) },
        ...entries.slice(cut).map((e) => ({ kind: 'crumb' as const, ...e })),
    ]
}
