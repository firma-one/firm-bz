/**
 * Shared grid layout for the engagement Files table — used by both the header row
 * (engagement-file-list.tsx) and each data row (engagement-file-row.tsx) so their
 * columns can never drift out of alignment.
 *
 * Name keeps a hard minimum width (180px) so it never gets crushed. The metadata
 * columns collapse (track width 0, cell hidden) progressively as the table
 * container narrows, via container queries scoped to FILE_TABLE_CONTAINER_CLASS.
 * Hide order (first to hide -> last): Due date -> File size -> Date modified ->
 * Owner. ID, Name, and Quick actions always stay visible.
 *
 * There are exactly 9 grid tracks, matching 8 rendered cells (Quick spans 2 tracks):
 * [1] checkbox(24px) [2] id(72px) [3] name(minmax 180px,1fr) [4-5] quick (2 tracks,
 * minmax(124px,10%) + 10%) [6] owner(14%) [7] date modified(12%) [8] due date(10%)
 * [9] file size(8%). Every track must be claimed by a cell — an unclaimed track, or
 * reassigning which cell a track's width belongs to, causes grid misalignment
 * (cells overlapping/shifting) even when the cell itself is `hidden`.
 *
 * IMPORTANT: every Tailwind class below is written as a literal string (no template
 * interpolation) because Tailwind's content scanner matches source text directly —
 * a dynamically-built class name would not be found and its CSS would never be generated.
 */

/** Apply to the scrollable ancestor that both the header and rows live inside. */
export const FILE_TABLE_CONTAINER_CLASS = '@container/file-table'

/** Applied to the header row's and each data row's outer grid element, alongside "grid". */
export const FILE_TABLE_GRID_COLS_CLASS =
    'grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_0px_0px_0px_0px] ' +
    '@lg/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_0px_0px_0px] ' +
    '@xl/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_12%_0px_0px] ' +
    '@3xl/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_12%_0px_8%] ' +
    '@4xl/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_12%_10%_8%]'

/** Hidden below @lg, flex from @lg up. */
export const OWNER_COL_CLASS = 'hidden @lg/file-table:flex'
/** Hidden below @xl, flex from @xl up. */
export const DATE_MODIFIED_COL_CLASS = 'hidden @xl/file-table:flex'
/** Hidden below @3xl, flex from @3xl up. */
export const FILE_SIZE_COL_CLASS = 'hidden @3xl/file-table:flex'
/** Hidden below @4xl, flex from @4xl up — hides first as space runs out. */
export const DUE_DATE_COL_CLASS = 'hidden @4xl/file-table:flex'
