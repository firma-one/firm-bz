/**
 * Shared grid layout for the engagement Files table — used by both the header row
 * (engagement-file-list.tsx) and each data row (engagement-file-row.tsx) so their
 * columns can never drift out of alignment.
 *
 * Name keeps a hard minimum width (180px) so it never gets crushed. The metadata
 * columns collapse (track width 0, cell hidden) progressively as the table
 * container narrows, via container queries scoped to FILE_TABLE_CONTAINER_CLASS.
 * They hide from the right: Size -> Modified -> Owner -> Due -> Status. Status and Due
 * stay longest because they are what a deliverable is tracked by. ID, Name and the
 * quick actions always stay visible.
 *
 * There are exactly 10 grid tracks: [1] checkbox(24px) [2] id(72px) [3] name(minmax 180px,1fr)
 * [4] badges(minmax 124px,10%) [5] quick(10%) [6] status(128px) [7] due(128px)
 * [8] owner(150px) [9] modified(124px) [10] size(84px). The Name cell spans tracks 3–5 and
 * holds the badges and quick actions at its end, so when a row has none showing (tools appear
 * only on hover) the name runs on into that space. Hidden cells are always the trailing
 * ones, so a visible cell never slides into a hidden column's empty track.
 *
 * Breakpoints: a column appears only once the row can hold it. A row needs the fixed
 * tracks (24 + 72 + 180 + 124 = 400px), the 9 gaps between the 10 tracks (9 x 16 =
 * 144px — a hidden track still keeps its gap), the row's padding and a scrollbar
 * (30px), Quick's 10%, plus every visible metadata track. Solving for the container width W
 * (Badges is 124px until W reaches 1240px, then 10%):
 *   ID + Name + Quick            fits from ~638px  (below this the rows scroll sideways)
 *   + Status (128px)             fits from ~780px  -> @[49rem]
 *   + Due (128px)                fits from ~922px  -> @[58rem]
 *   + Owner (150px)              fits from ~1088px -> @[68rem]
 *   + Modified (124px)           fits from ~1226px -> @[77rem]
 *   + Size (84px)                fits from ~1330px -> @[84rem]
 * Date modified and Due keep fixed widths so "Sep 24, 2026" never wraps; Due's 128px holds a day with
 * a time in its compact form ("Oct 30 · 3:30 PM").
 *
 * IMPORTANT: every Tailwind class below is written as a literal string (no template
 * interpolation) because Tailwind's content scanner matches source text directly —
 * a dynamically-built class name would not be found and its CSS would never be generated.
 */

/** Apply to the scrollable ancestor that both the header and rows live inside. */
export const FILE_TABLE_CONTAINER_CLASS = '@container/file-table'

/** Applied to the header row's and each data row's outer grid element, alongside "grid". */
export const FILE_TABLE_GRID_COLS_CLASS =
    'grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_0px_0px_0px_0px_0px] ' +
    '@[49rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_128px_0px_0px_0px_0px] ' +
    '@[58rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_128px_128px_0px_0px_0px] ' +
    '@[68rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_128px_128px_150px_0px_0px] ' +
    '@[77rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_128px_128px_150px_124px_0px] ' +
    '@[84rem]/file-table:grid-cols-[24px_72px_minmax(180px,1fr)_minmax(124px,10%)_10%_128px_128px_150px_124px_84px]'

/**
 * Notion's database grid, as NotionTable draws it (.claude/plans/app-design-refinements.md, section 10):
 * a 34px header with a line above and below, 34px rows with a line between and after, and a column line
 * in the gap before Name, Status, Due, Owner, Modified and Size. The checkbox is the gutter and the quick
 * actions are the row's own tools, so neither has a line before it.
 *
 * The line is taller than the row, and the row (and the header) clip it with overflow-hidden, so it
 * meets the row lines exactly. -left-2 is half the grid's gap-4. A hidden column draws no line.
 */
export const FILE_TABLE_COL_LINE_CLASS =
    'relative before:absolute before:-left-2 before:top-1/2 before:h-12 before:w-px before:-translate-y-1/2 before:bg-line'

/** Hidden below 49rem, flex from 49rem up — the last metadata column to hide. */
export const STATUS_COL_CLASS = 'hidden @[49rem]/file-table:flex'
/** Hidden below 58rem, flex from 58rem up. */
export const DUE_DATE_COL_CLASS = 'hidden @[58rem]/file-table:flex'
/** Hidden below 68rem, flex from 68rem up. */
export const OWNER_COL_CLASS = 'hidden @[68rem]/file-table:flex'
/** Hidden below 77rem, flex from 77rem up. */
export const DATE_MODIFIED_COL_CLASS = 'hidden @[77rem]/file-table:flex'
/** Hidden below 84rem, flex from 84rem up — the first to hide as space runs out. */
export const FILE_SIZE_COL_CLASS = 'hidden @[84rem]/file-table:flex'
