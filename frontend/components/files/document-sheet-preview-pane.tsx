'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { documentName } from '@/lib/preview-kinds'

/** Row height in px. Fixed, which is what makes windowing a matter of arithmetic. */
const ROW_H = 24
/** Width of the row-number gutter, and the fallback width for a column with none set. */
const GUTTER_W = 48
const DEFAULT_COL_W = 80
/** Guard against a pathological sheet claiming a vast used range. */
const MAX_COLS = 256
const MAX_ROWS = 50_000

interface SheetCell {
    text: string
    bg?: string
    bold?: boolean
    align?: 'left' | 'right' | 'center'
}

interface Merge {
    top: number
    left: number
    bottom: number
    right: number
}

/** An embedded picture, positioned against the same column offsets the cells use. */
interface SheetImage {
    url: string
    left: number
    top: number
    width: number
    height: number
}

interface SheetModel {
    name: string
    rowCount: number
    colCount: number
    colWidths: number[]
    /** Sparse: "row:col" -> cell. A full matrix would allocate for every empty cell in the
     *  used range, which for a Sheets-authored file is most of it. */
    cells: Map<string, SheetCell>
    merges: Merge[]
    /** Cells covered by a merge but not its anchor, so they are skipped when drawing. */
    covered: Set<string>
    images: SheetImage[]
}

/** "A" -> 1, "AA" -> 27 */
function columnToIndex(letters: string): number {
    let n = 0
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
    return n
}

/** 1 -> "A", 27 -> "AA" */
function indexToColumn(index: number): string {
    let s = ''
    let n = index
    while (n > 0) {
        const rem = (n - 1) % 26
        s = String.fromCharCode(65 + rem) + s
        n = Math.floor((n - 1) / 26)
    }
    return s
}

/**
 * ExcelJS cell values are a union: primitives, Dates, formula objects carrying a cached
 * result, rich text runs, hyperlinks, errors. Flatten to what the cell should read as.
 */
function cellText(value: any): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (value instanceof Date) return value.toLocaleDateString()
    if (typeof value === 'object') {
        // A formula cell carries the value Excel last computed; a viewer shows that rather
        // than trying to recalculate.
        if ('result' in value) return cellText((value as any).result)
        if ('richText' in value) return ((value as any).richText ?? []).map((r: any) => r.text ?? '').join('')
        if ('text' in value) return String((value as any).text ?? '')
        if ('error' in value) return String((value as any).error ?? '')
    }
    return ''
}

/** ExcelJS fills carry 8-digit ARGB; CSS wants RRGGBB. Theme-only fills have no argb. */
function fillToCss(fill: any): string | undefined {
    const argb = fill?.fgColor?.argb
    if (typeof argb !== 'string' || argb.length !== 8) return undefined
    if (argb.slice(0, 2) === '00') return undefined // fully transparent
    return `#${argb.slice(2)}`
}

/** Office measures anchor offsets in EMUs. 914400 per inch, at 96dpi. */
const EMU_PER_PX = 9525

/** ExcelJS column widths are in characters; this is the usual approximation to pixels. */
function charsToPx(width: number | undefined): number {
    if (!width || width <= 0) return DEFAULT_COL_W
    return Math.round(width * 7 + 5)
}

/**
 * Split delimited text into rows. Handles quoted fields, doubled quotes inside them, and
 * newlines within a quoted field — all of which appear in exported data often enough that a
 * naive split on commas mangles real files.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]

        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
            } else {
                field += ch
            }
            continue
        }

        if (ch === '"') { quoted = true; continue }
        if (ch === delimiter) { row.push(field); field = ''; continue }
        if (ch === '\r') continue
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
        field += ch
    }

    if (field.length || row.length) { row.push(field); rows.push(row) }
    return rows
}

/**
 * Pick the delimiter from the first line by counting candidates. Exports from European
 * locales are semicolon-separated often enough that assuming a comma turns the whole file
 * into one column.
 */
function sniffDelimiter(text: string): string {
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
    const counts = [',', ';', '\t', '|'].map((d) => ({
        d,
        // Only separators outside quotes count, so a comma inside "Acme, Inc." does not
        // win the vote for a semicolon-separated file.
        n: firstLine.split('').reduce((acc, ch, i, arr) => {
            let quoted = false
            for (let k = 0; k < i; k++) if (arr[k] === '"') quoted = !quoted
            return acc + (ch === d && !quoted ? 1 : 0)
        }, 0),
    }))
    counts.sort((a, b) => b.n - a.n)
    return counts[0].n > 0 ? counts[0].d : ','
}

/** Build the same model the workbook path produces, so one grid renders both. */
function sheetFromDelimited(text: string, delimiter: string, name: string): SheetModel {
    const rows = parseDelimited(text, delimiter)
    const colCount = Math.min(rows.reduce((max, r) => Math.max(max, r.length), 0), MAX_COLS)
    const rowCount = Math.min(rows.length, MAX_ROWS)

    const cells = new Map<string, SheetCell>()
    // Width each column to its widest value, within reason — a delimited file carries no
    // column metadata, and leaving everything at the default makes most of them unreadable.
    const widest = new Array(colCount).fill(0)

    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < Math.min(rows[r].length, colCount); c++) {
            const value = rows[r][c]
            if (!value) continue
            widest[c] = Math.max(widest[c], value.length)
            const numeric = value !== '' && !Number.isNaN(Number(value))
            cells.set(`${r + 1}:${c + 1}`, {
                text: value,
                // The first row of a delimited file is a header often enough to be worth
                // showing as one; nothing in the format says so, so this is a guess.
                bold: r === 0,
                align: r === 0 ? 'left' : numeric ? 'right' : 'left',
            })
        }
    }

    const colWidths = widest.map((chars) => Math.min(Math.max(chars * 7 + 12, DEFAULT_COL_W), 420))

    return { name, rowCount, colCount, colWidths, cells, merges: [], covered: new Set(), images: [] }
}

interface DocumentSheetPreviewPaneProps {
    document: any
    projectId?: string
    /** Called when this pane cannot render the file, so the caller can show the PDF. */
    onFallback: (reason: string) => void
    /** Switch to the converted PDF deliberately — the only view that renders charts. */
    onViewPrinted?: () => void
}

export function DocumentSheetPreviewPane({ document, projectId, onFallback, onViewPrinted }: DocumentSheetPreviewPaneProps) {
    const [sheets, setSheets] = useState<SheetModel[]>([])
    const [activeSheet, setActiveSheet] = useState(0)
    const [loading, setLoading] = useState(true)
    const [scrollTop, setScrollTop] = useState(0)
    const [scrollLeft, setScrollLeft] = useState(0)
    const [viewport, setViewport] = useState({ width: 0, height: 0 })

    const scrollRef = useRef<HTMLDivElement | null>(null)
    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

    // Keep the callback out of the effect's dependencies: the parent recreates it on every
    // render, and re-running this effect would refetch the workbook each time.
    const onFallbackRef = useRef(onFallback)
    useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])

    useEffect(() => {
        if (!effectiveProjectId || !documentId) return
        let cancelled = false

        void (async () => {
            setLoading(true)
            setSheets([])
            setActiveSheet(0)

            try {
                const url = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview?native=1`
                const res = await fetch(url)
                if (cancelled) return

                const contentType = res.headers.get('Content-Type') ?? ''
                const name = documentName(document) || 'Sheet'

                if (!res.ok) {
                    onFallbackRef.current(`preview request failed (${res.status})`)
                    return
                }

                // The adapters convert to PDF when they cannot serve the original, and the
                // route answers with an HTML card when even that fails. Either means this
                // pane is the wrong one.
                if (/application\/pdf|text\/html/.test(contentType)) {
                    onFallbackRef.current('not served as a workbook')
                    return
                }

                const data = await res.arrayBuffer()
                if (cancelled) return

                // Decide from the bytes, not the name or the mime type. OneDrive reports a
                // .csv as application/vnd.ms-excel, call sites disagree about which field
                // holds the filename, and either mistake sends delimited text to a parser
                // that only understands zip archives. Every xlsx is a zip, so it opens
                // "PK"; nothing else does.
                const signature = new Uint8Array(data.slice(0, 2))
                const looksLikeWorkbook = signature[0] === 0x50 && signature[1] === 0x4b

                if (!looksLikeWorkbook) {
                    const text = new TextDecoder().decode(data)
                    if (cancelled) return
                    setSheets([sheetFromDelimited(text, sniffDelimiter(text), name)])
                    setLoading(false)
                    return
                }

                const ExcelJS = (await import('exceljs')).default
                if (cancelled) return
                const workbook = new ExcelJS.Workbook()
                await workbook.xlsx.load(data as any)
                if (cancelled) return

                const parsed: SheetModel[] = []
                workbook.eachSheet((worksheet) => {
                    const colCount = Math.min(worksheet.columnCount || 0, MAX_COLS)
                    const rowCount = Math.min(worksheet.rowCount || 0, MAX_ROWS)

                    const colWidths: number[] = []
                    for (let c = 1; c <= colCount; c++) {
                        colWidths.push(charsToPx(worksheet.getColumn(c).width))
                    }

                    const cells = new Map<string, SheetCell>()
                    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                        if (rowNumber > rowCount) return
                        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                            if (colNumber > colCount) return
                            const text = cellText(cell.value)
                            const bg = fillToCss(cell.fill)
                            const bold = Boolean(cell.font?.bold)
                            const horizontal = cell.alignment?.horizontal
                            const align: SheetCell['align'] =
                                horizontal === 'right' || horizontal === 'center' || horizontal === 'left'
                                    ? horizontal
                                    : typeof cell.value === 'number' ? 'right' : 'left'
                            if (!text && !bg && !bold) return
                            cells.set(`${rowNumber}:${colNumber}`, { text, bg, bold, align })
                        })
                    })

                    const merges: Merge[] = []
                    const covered = new Set<string>()
                    const rawMerges: string[] = (worksheet.model as any)?.merges ?? []
                    for (const range of rawMerges) {
                        const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
                        if (!m) continue
                        const merge: Merge = {
                            left: columnToIndex(m[1]),
                            top: parseInt(m[2], 10),
                            right: columnToIndex(m[3]),
                            bottom: parseInt(m[4], 10),
                        }
                        merges.push(merge)
                        for (let r = merge.top; r <= merge.bottom; r++) {
                            for (let c = merge.left; c <= merge.right; c++) {
                                if (r !== merge.top || c !== merge.left) covered.add(`${r}:${c}`)
                            }
                        }
                    }

                    // Embedded pictures. ExcelJS normalises the drawing anchor to a
                    // zero-based cell plus an EMU offset, which drops straight onto the same
                    // column offsets the cells are positioned with. A two-cell anchor has no
                    // `ext`, so its size comes from the span between the two anchors.
                    const images: SheetImage[] = []
                    const colLeft = (zeroBasedCol: number) => {
                        let x = 0
                        for (let i = 0; i < zeroBasedCol && i < colWidths.length; i++) x += colWidths[i]
                        return x
                    }
                    for (const placement of (worksheet.getImages?.() ?? []) as any[]) {
                        try {
                            const media: any = workbook.getImage(Number(placement.imageId))
                            if (!media?.buffer) continue
                            const tl = placement.range?.tl
                            if (!tl) continue

                            const left = colLeft(tl.nativeCol ?? 0) + (tl.nativeColOff ?? 0) / EMU_PER_PX
                            const top = (tl.nativeRow ?? 0) * ROW_H + (tl.nativeRowOff ?? 0) / EMU_PER_PX

                            let width = placement.range?.ext?.width
                            let height = placement.range?.ext?.height
                            const br = placement.range?.br
                            if ((!width || !height) && br) {
                                width = colLeft(br.nativeCol ?? 0) + (br.nativeColOff ?? 0) / EMU_PER_PX - left
                                height = (br.nativeRow ?? 0) * ROW_H + (br.nativeRowOff ?? 0) / EMU_PER_PX - top
                            }
                            if (!width || !height || width <= 0 || height <= 0) continue

                            const blob = new Blob([media.buffer], { type: `image/${media.extension ?? 'png'}` })
                            images.push({ url: URL.createObjectURL(blob), left, top, width, height })
                        } catch {
                            /* one unreadable picture should not cost the whole sheet */
                        }
                    }

                    parsed.push({ name: worksheet.name, rowCount, colCount, colWidths, cells, merges, covered, images })
                })

                if (cancelled) return
                if (!parsed.length) {
                    onFallbackRef.current('workbook has no sheets')
                    return
                }
                setSheets(parsed)
                setLoading(false)
            } catch (err) {
                if (cancelled) return
                console.error('[sheet-preview] could not render workbook', err)
                onFallbackRef.current('workbook could not be parsed')
            }
        })()

        return () => { cancelled = true }
    }, [effectiveProjectId, documentId])

    // Blob URLs for embedded pictures are held by the browser until revoked, so release
    // them whenever this set of sheets is replaced.
    useEffect(() => {
        return () => {
            for (const s of sheets) for (const image of s.images) URL.revokeObjectURL(image.url)
        }
    }, [sheets])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) =>
            setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
        )
        ro.observe(el)
        setViewport({ width: el.clientWidth, height: el.clientHeight })
        return () => ro.disconnect()
    }, [sheets.length])

    const onScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        setScrollTop(el.scrollTop)
        setScrollLeft(el.scrollLeft)
    }, [])

    const sheet = sheets[activeSheet]

    /** Running x offset of each column, so a scroll position maps straight to a column. */
    const colOffsets = useMemo(() => {
        const offsets: number[] = [0]
        if (!sheet) return offsets
        for (let i = 0; i < sheet.colWidths.length; i++) offsets.push(offsets[i] + sheet.colWidths[i])
        return offsets
    }, [sheet])

    const totalWidth = colOffsets[colOffsets.length - 1] ?? 0
    const totalHeight = (sheet?.rowCount ?? 0) * ROW_H

    /** Only the cells actually on screen are mounted; everything else is pure arithmetic. */
    const window = useMemo(() => {
        if (!sheet) return { firstRow: 1, lastRow: 0, firstCol: 1, lastCol: 0 }
        const firstRow = Math.max(1, Math.floor(scrollTop / ROW_H) - 2)
        const lastRow = Math.min(sheet.rowCount, Math.ceil((scrollTop + viewport.height) / ROW_H) + 2)

        let firstCol = 1
        while (firstCol < sheet.colCount && colOffsets[firstCol] < scrollLeft) firstCol++
        firstCol = Math.max(1, firstCol - 2)
        let lastCol = firstCol
        while (lastCol < sheet.colCount && colOffsets[lastCol] < scrollLeft + viewport.width) lastCol++
        lastCol = Math.min(sheet.colCount, lastCol + 2)

        return { firstRow, lastRow, firstCol, lastCol }
    }, [sheet, scrollTop, scrollLeft, viewport, colOffsets])

    if (loading || !sheet) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center bg-[#f3f4f6]">
                <LoadingSpinner size="md" />
            </div>
        )
    }

    const visibleCells: React.ReactNode[] = []
    for (let r = window.firstRow; r <= window.lastRow; r++) {
        for (let c = window.firstCol; c <= window.lastCol; c++) {
            const key = `${r}:${c}`
            if (sheet.covered.has(key)) continue
            const cell = sheet.cells.get(key)
            const merge = sheet.merges.find((m) => m.top === r && m.left === c)
            const width = merge
                ? (colOffsets[Math.min(merge.right, sheet.colCount)] ?? totalWidth) - colOffsets[c - 1]
                : sheet.colWidths[c - 1]
            const height = merge ? (merge.bottom - merge.top + 1) * ROW_H : ROW_H
            if (!cell && !merge) continue

            visibleCells.push(
                <div
                    key={key}
                    className="absolute border-r border-b border-[#e8e8ea] px-1.5 text-[11px] leading-[22px] whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                        left: colOffsets[c - 1],
                        top: (r - 1) * ROW_H,
                        width,
                        height,
                        background: cell?.bg,
                        fontWeight: cell?.bold ? 600 : undefined,
                        textAlign: cell?.align,
                    }}
                    title={cell?.text || undefined}
                >
                    {cell?.text ?? ''}
                </div>
            )
        }
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white">
            {onViewPrinted && (
                <div className="flex shrink-0 items-center justify-end gap-1.5 px-3 py-1.5 border-b border-[#e5e7eb] bg-white">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={onViewPrinted}
                                className="h-6 px-2 rounded inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            >
                                <FileText className="h-3.5 w-3.5" />
                                Switch to Print View
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            Page layout — the only view that renders charts
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}

            {/* Column letters, pinned. Translated rather than scrolled so it cannot lag. */}
            <div className="flex shrink-0 border-b border-[#d8d8dc] bg-[#f7f7f8]">
                <div className="shrink-0 border-r border-[#d8d8dc]" style={{ width: GUTTER_W }} />
                <div className="relative flex-1 overflow-hidden" style={{ height: ROW_H }}>
                    <div className="absolute inset-0" style={{ transform: `translateX(${-scrollLeft}px)` }}>
                        {Array.from({ length: window.lastCol - window.firstCol + 1 }, (_, i) => {
                            const c = window.firstCol + i
                            return (
                                <div
                                    key={c}
                                    className="absolute top-0 border-r border-[#d8d8dc] text-center text-[10px] font-mono leading-[24px] text-slate-500"
                                    style={{ left: colOffsets[c - 1], width: sheet.colWidths[c - 1], height: ROW_H }}
                                >
                                    {indexToColumn(c)}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex">
                {/* Row numbers, pinned the same way. */}
                <div className="shrink-0 relative overflow-hidden border-r border-[#d8d8dc] bg-[#f7f7f8]" style={{ width: GUTTER_W }}>
                    <div className="absolute inset-0" style={{ transform: `translateY(${-scrollTop}px)` }}>
                        {Array.from({ length: Math.max(0, window.lastRow - window.firstRow + 1) }, (_, i) => {
                            const r = window.firstRow + i
                            return (
                                <div
                                    key={r}
                                    className="absolute left-0 right-0 border-b border-[#e8e8ea] text-center text-[10px] font-mono leading-[23px] text-slate-500"
                                    style={{ top: (r - 1) * ROW_H, height: ROW_H }}
                                >
                                    {r}
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto">
                    <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
                        {visibleCells}
                        {sheet.images.map((image, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={i}
                                src={image.url}
                                alt=""
                                draggable={false}
                                className="absolute pointer-events-none"
                                style={{ left: image.left, top: image.top, width: image.width, height: image.height }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {sheets.length > 1 && (
                <div className="flex shrink-0 items-center gap-0.5 px-2 py-1 border-t border-[#d8d8dc] bg-[#f7f7f8] overflow-x-auto">
                    {sheets.map((s, i) => (
                        <button
                            key={s.name + i}
                            type="button"
                            onClick={() => { setActiveSheet(i); scrollRef.current?.scrollTo({ top: 0, left: 0 }) }}
                            className={`shrink-0 px-2 h-6 rounded text-[11px] ${
                                i === activeSheet
                                    ? 'bg-white text-slate-900 font-medium shadow-sm border border-[#d8d8dc]'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                            }`}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
