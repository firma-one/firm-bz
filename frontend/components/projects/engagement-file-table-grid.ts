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
 * minmax(124px,10%) + 10%) [6] owner(14%) [7] date modified(minmax 112px,12%)
 * [8] due date(10%) [9] file size(8%). Every track must be claimed by a cell — an
 * unclaimed track, or reassigning which cell a track's width belongs to, causes grid
 * misalignment (cells overlapping/shifting) even when the cell itself is `hidden`.
 *
 * Breakpoints: a column appears only once the row can hold it. A row needs the fixed
 * tracks (24 + 72 + 180 + 124 = 400px), the 8 gaps between the 9 tracks (8 x 16 =
 * 128px — a hidden track still keeps its gap), the row's padding and a scrollbar
 * (18px), plus every visible percentage track. Solving for the container width W:
 *   ID + Name + Quick            fits from ~605px  (below this the rows scroll sideways)
 *   + Owner (14%)                fits from ~713px  -> @[45rem]
 *   + Date modified (>=112px)    fits from ~860px  -> @[54rem]
 *   + File size (8%)             fits from ~961px  -> @[61rem]
 *   + Due date (10%)             fits from ~1166px -> @[74rem]
 * The earlier @lg/@xl/@3xl/@4xl breakpoints (512–896px) left out the gaps, so with a
 * side panel open the row overflowed: File size slid out of view, and the modified
 * date wrapped onto a second line taller than the row, which put a vertical scrollbar
 * on a five-row list. Date modified keeps a 112px floor so "Sep 24, 2026" never wraps.
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
    '@[45rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_0px_0px_0px] ' +
    '@[54rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_minmax(112px,12%)_0px_0px] ' +
    '@[61rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_minmax(112px,12%)_0px_8%] ' +
    '@[74rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_14%_minmax(112px,12%)_10%_8%]'

/** Hidden below 45rem, flex from 45rem up. */
export const OWNER_COL_CLASS = 'hidden @[45rem]/file-table:flex'
/** Hidden below 54rem, flex from 54rem up. */
export const DATE_MODIFIED_COL_CLASS = 'hidden @[54rem]/file-table:flex'
/** Hidden below 61rem, flex from 61rem up. */
export const FILE_SIZE_COL_CLASS = 'hidden @[61rem]/file-table:flex'
/** Hidden below 74rem, flex from 74rem up — hides first as space runs out. */
export const DUE_DATE_COL_CLASS = 'hidden @[74rem]/file-table:flex'
