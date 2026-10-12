'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2, ChevronUp, ChevronDown, ChevronsLeftRight, ChevronsDownUp, List, PanelLeft, Search, X, MoreHorizontal, Table2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { PreviewLoadingState } from '@/components/files/preview-loading-state'
import { DocumentBlobPreviewPane } from '@/components/files/document-blob-preview-pane'
import { cacheRead, cacheWrite } from '@/lib/preview-cache'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

const ZOOM_MIN = 50
const ZOOM_MAX = 400
const ZOOM_DEFAULT = 100
/** Offered in the zoom dropdown. Kept inside ZOOM_MIN..ZOOM_MAX so the +/- buttons, the
 *  dropdown and the reset button can never disagree about the allowed range. */
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400]

/** Zoom is relative to fit-width, so the useful ceiling depends on how big the page is: a
 *  spreadsheet exported as one giant page needs several hundred percent before it is
 *  legible, where a normal page does not. Step coarsely up there so reaching 400 is not
 *  twenty clicks. */
function zoomStep(from: number): number {
    return from >= 200 ? 50 : 15
}

/** Pages rendered to canvas on either side of the current page. Everything else is a
 *  correctly-sized placeholder, so scrolling never shifts and memory stays bounded.
 *  Tightened past 200%, where a single canvas can be hundreds of megabytes. */
const RENDER_AHEAD = 2
const RENDER_AHEAD_HIGH_ZOOM = 1
/** Past 300% a single canvas approaches the budget above, so keep only the current page
 *  alive. At that magnification one page fills the viewport anyway. */
const RENDER_AHEAD_EXTREME_ZOOM = 0

/** Backing-store ceiling for one page canvas, in device pixels. Browsers refuse to
 *  allocate beyond roughly 16k on an edge, and a canvas is 4 bytes a pixel, so an
 *  unbounded 400% render of a sheet-sized page fails outright or evicts the tab. Past
 *  this the backing store is rendered below device resolution and upscaled by CSS: the
 *  page goes soft rather than blank.
 *
 *  Sized so it does not bite on anything reachable before 400% existed — a retina A4 at
 *  the old 200% ceiling lands just inside it — so no document that renders sharply today
 *  starts rendering softly. */
const MAX_CANVAS_PIXELS = 67_108_864
const MAX_CANVAS_EDGE = 16_384

/** Shared empty list, so a page with no hits passes a stable reference to the overlay. */
const EMPTY_HITS: Array<{ match: Match; index: number }> = []

/** Vertical gap between pages, and the horizontal breathing room used when fitting a
 *  page to the pane width. Both in CSS px. */
const PAGE_GAP = 12
const PAGE_INSET = 16

/** Below this toolbar width the view controls collapse into an overflow menu rather than
 *  wrapping onto a second row, which in a narrow dock costs more than it is worth. */
const TOOLBAR_COMPACT_BELOW = 480

/** Thumbnail column width, and the rendered width of a thumbnail inside it. */
const SIDEBAR_WIDTH = 168
const THUMB_WIDTH = 104

interface DocumentPdfPreviewPaneProps {
    document: any
    projectId?: string
    /** A second way to read this document, shown at the right of the toolbar. Forwarded to
     *  the iframe pane as well: this pane hands off to it for anything it cannot open, and
     *  the reader must not lose the alternative when that happens. */
    alternateView?: { label: string; onSelect: () => void }
}

/** One bookmark, flattened to a page number at load so clicking is instant. */
interface OutlineEntry {
    title: string
    pageNumber: number | null
    depth: number
}

/**
 * Resolve a bookmark destination to a 1-based page number. A destination is either a named
 * string that has to be looked up, or an explicit array whose first element is a page ref.
 */
async function resolveDestination(pdf: PDFDocumentProxy, dest: string | any[] | null): Promise<number | null> {
    try {
        const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
        if (!Array.isArray(explicit) || !explicit.length) return null
        const ref = explicit[0]
        if (typeof ref === 'number') return ref + 1
        if (ref && typeof ref === 'object' && 'num' in ref) return (await pdf.getPageIndex(ref)) + 1
        return null
    } catch {
        // A bookmark pointing at a destination the document does not define is not worth
        // failing the whole outline over — it just renders as non-clickable.
        return null
    }
}

/** Depth-first walk, resolving each node's destination. External-URL bookmarks are skipped:
 *  this is an in-document navigator, not a link launcher. */
async function flattenOutline(
    pdf: PDFDocumentProxy,
    nodes: any[],
    depth = 0,
    out: OutlineEntry[] = [],
): Promise<OutlineEntry[]> {
    for (const node of nodes) {
        if (!node?.url) {
            out.push({ title: node?.title?.trim() || 'Untitled', pageNumber: await resolveDestination(pdf, node?.dest ?? null), depth })
        }
        if (Array.isArray(node?.items) && node.items.length) {
            await flattenOutline(pdf, node.items, depth + 1, out)
        }
    }
    return out
}

/**
 * One page's text, flattened for searching.
 *
 * `text` is every item's string concatenated, which is what a query is matched against.
 * `starts[i]` is where item `i` begins in it, so a match range can be mapped back to the
 * items it covers and turned into rectangles. A match frequently spans several items —
 * pdf.js splits a visual line wherever the font or spacing changes — so the mapping has to
 * be range-based rather than per-item.
 */
interface PageText {
    text: string
    lower: string
    starts: number[]
    items: Array<{ str: string; transform: number[]; width: number; height: number }>
}

/** A hit, as a character range inside one page's flattened text. */
interface Match {
    page: number
    start: number
    end: number
}

/** A highlight rectangle in CSS pixels, relative to the page's top-left. */
interface HighlightRect {
    left: number
    top: number
    width: number
    height: number
}

/**
 * Turn a match range into rectangles, one per text item it overlaps.
 *
 * Within an item the offset is interpolated by character count. That is an approximation —
 * glyphs are not uniform width — but pdf.js gives no per-glyph positions, and for a find
 * highlight a few pixels of slop at the edges is invisible. Everything else (page scale,
 * user rotation, intrinsic page rotation) comes from the viewport transform, so highlights
 * follow zoom and rotation without any extra bookkeeping.
 */
function matchToRects(
    pageText: PageText,
    match: Match,
    viewportTransform: number[],
    scale: number,
    transformFn: (m1: any, m2: any) => any[],
): HighlightRect[] {
    const rects: HighlightRect[] = []

    for (let i = 0; i < pageText.items.length; i++) {
        const item = pageText.items[i]
        const itemStart = pageText.starts[i]
        const itemEnd = itemStart + item.str.length
        if (itemEnd <= match.start || itemStart >= match.end) continue
        if (!item.str.length) continue

        const from = Math.max(match.start, itemStart) - itemStart
        const to = Math.min(match.end, itemEnd) - itemStart

        const tx = transformFn(viewportTransform, item.transform)
        // Vertical scale of the composed matrix is the rendered font height; the baseline
        // sits at tx[5], so the glyph box starts one font height above it.
        const fontHeight = Math.hypot(tx[1], tx[3]) || item.height * scale
        const fullWidth = item.width * scale
        const left = tx[4] + (fullWidth * from) / item.str.length
        const width = (fullWidth * (to - from)) / item.str.length

        if (width <= 0 || fontHeight <= 0) continue
        rects.push({ left, top: tx[5] - fontHeight, width, height: fontHeight })
    }

    return rects
}

interface BasePage {
    /** Page dimensions at pdf.js scale 1, i.e. 72dpi CSS px. */
    width: number
    height: number
}

/**
 * Renders one page to a canvas. Mounted only while the page is inside the render window,
 * so going out of view frees the bitmap.
 */
function PdfPageCanvas({
    pdf,
    pageNumber,
    scale,
    rotation,
}: {
    pdf: PDFDocumentProxy
    pageNumber: number
    scale: number
    rotation: number
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        let cancelled = false
        let task: RenderTask | null = null

        void (async () => {
            try {
                const page = await pdf.getPage(pageNumber)
                if (cancelled) return

                // `rotation` REPLACES the page's own /Rotate rather than adding to it, so a
                // scanned landscape page (intrinsic 90) would snap upright if we passed the
                // user's rotation alone. Compose the two.
                const viewport = page.getViewport({ scale, rotation: page.rotate + rotation })
                // Render at device resolution, then scale back down via CSS, so text stays
                // sharp on retina displays instead of being upscaled from a 1x bitmap —
                // but never past what the browser will allocate. Both the per-edge and the
                // total-area limits bite on a large page at high zoom, so take whichever
                // is stricter and drop below 1x if even that is too big.
                const cssW = viewport.width
                const cssH = viewport.height
                const dpr = Math.max(
                    0.1,
                    Math.min(
                        window.devicePixelRatio || 1,
                        MAX_CANVAS_EDGE / cssW,
                        MAX_CANVAS_EDGE / cssH,
                        Math.sqrt(MAX_CANVAS_PIXELS / (cssW * cssH)),
                    ),
                )
                canvas.width = Math.floor(cssW * dpr)
                canvas.height = Math.floor(cssH * dpr)
                canvas.style.width = `${Math.floor(cssW)}px`
                canvas.style.height = `${Math.floor(cssH)}px`

                task = page.render({
                    canvas,
                    viewport,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                })
                await task.promise
            } catch (err: any) {
                // A cancelled render is the normal outcome of zooming or scrolling away.
                if (err?.name !== 'RenderingCancelledException' && !cancelled) {
                    console.error(`[pdf-preview] failed to render page ${pageNumber}`, err)
                }
            }
        })()

        return () => {
            cancelled = true
            task?.cancel()
        }
    }, [pdf, pageNumber, scale, rotation])

    return <canvas ref={canvasRef} className="block" />
}

/**
 * One thumbnail. The canvas is mounted only once the item scrolls into the strip, so a
 * 200-page document does not raster 200 bitmaps to show a sidebar.
 */
function PdfThumb({
    pdf,
    pageNumber,
    width,
    height,
    rotation,
    scale,
    active,
    onSelect,
}: {
    pdf: PDFDocumentProxy
    pageNumber: number
    width: number
    height: number
    rotation: number
    scale: number
    active: boolean
    onSelect: () => void
}) {
    const ref = useRef<HTMLButtonElement | null>(null)
    const [visible, setVisible] = useState(false)

    // Follow the document: when this page becomes current, bring its thumbnail into view.
    // 'nearest' so an already-visible thumbnail does not jolt the strip on every page turn.
    useEffect(() => {
        if (active) ref.current?.scrollIntoView({ block: 'nearest' })
    }, [active])

    useEffect(() => {
        const el = ref.current
        if (!el || visible) return
        const io = new IntersectionObserver(
            (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true) },
            { root: el.closest('[data-thumb-strip]'), rootMargin: '200px' },
        )
        io.observe(el)
        return () => io.disconnect()
    }, [visible])

    return (
        <button
            ref={ref}
            type="button"
            onClick={onSelect}
            className="group w-full flex flex-col items-center gap-1 py-1.5 focus:outline-none"
            aria-label={`Go to page ${pageNumber}`}
            aria-current={active ? 'true' : undefined}
        >
            <div
                className={`bg-white overflow-hidden ${active ? 'ring-2 ring-slate-500' : 'ring-1 ring-slate-200 group-hover:ring-slate-400'}`}
                style={{ width, height }}
            >
                {visible && <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} rotation={rotation} />}
            </div>
            <span className={`text-[10px] font-mono tabular-nums ${active ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                {pageNumber}
            </span>
        </button>
    )
}

/**
 * Find highlights for one page, drawn over the canvas. Rectangles are recomputed from the
 * page's live viewport, so they track zoom and rotation for free.
 */
function PdfPageHighlights({
    pdf,
    pageNumber,
    scale,
    rotation,
    pageText,
    hits,
    activeMatch,
    transformFn,
}: {
    pdf: PDFDocumentProxy
    pageNumber: number
    scale: number
    rotation: number
    pageText: PageText | undefined
    hits: Array<{ match: Match; index: number }>
    activeMatch: number
    transformFn: ((m1: any, m2: any) => any[]) | null
}) {
    const [boxes, setBoxes] = useState<Array<HighlightRect & { active: boolean }>>([])

    useEffect(() => {
        if (!pageText || !hits.length || !transformFn) {
            setBoxes([])
            return
        }
        let cancelled = false
        void (async () => {
            const page = await pdf.getPage(pageNumber)
            if (cancelled) return
            const viewport = page.getViewport({ scale, rotation: page.rotate + rotation })
            const next: Array<HighlightRect & { active: boolean }> = []
            for (const { match, index } of hits) {
                for (const rect of matchToRects(pageText, match, viewport.transform, scale, transformFn)) {
                    next.push({ ...rect, active: index === activeMatch })
                }
            }
            if (!cancelled) setBoxes(next)
        })()
        return () => { cancelled = true }
    }, [pdf, pageNumber, scale, rotation, pageText, hits, activeMatch, transformFn])

    if (!boxes.length) return null

    return (
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {boxes.map((box, i) => (
                <div
                    key={i}
                    className={box.active ? 'absolute bg-orange-400/50 ring-1 ring-orange-500' : 'absolute bg-yellow-300/40'}
                    style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                />
            ))}
        </div>
    )
}

export function DocumentPdfPreviewPane({ document, projectId, alternateView }: DocumentPdfPreviewPaneProps) {
    const [zoom, setZoom] = useState(ZOOM_DEFAULT)
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
    const [basePages, setBasePages] = useState<BasePage[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [pageInput, setPageInput] = useState('1')
    const [inputFocused, setInputFocused] = useState(false)
    const [loading, setLoading] = useState(true)
    /** Set when the content is not a PDF, or pdf.js could not open it. Either way we hand
     *  off to the iframe pane, which already handles images and the server's
     *  "preview not available" HTML. */
    const [fallback, setFallback] = useState(false)
    const [containerWidth, setContainerWidth] = useState(0)
    const [containerHeight, setContainerHeight] = useState(0)
    /** 'width' reproduces the original behavior and stays the default. */
    const [fitMode, setFitMode] = useState<'width' | 'page'>('width')
    /** User rotation in degrees, composed on top of each page's intrinsic /Rotate. */
    const [rotation, setRotation] = useState(0)
    const [outline, setOutline] = useState<OutlineEntry[]>([])
    const [findOpen, setFindOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [matches, setMatches] = useState<Match[]>([])
    const [activeMatch, setActiveMatch] = useState(0)
    /** Text for every page, not just rendered ones — a query has to find hits on pages that
     *  are nowhere near the viewport. Extracted once, in the background, after first paint. */
    const pageTextRef = useRef<Map<number, PageText>>(new Map())
    const [textReady, setTextReady] = useState(false)
    /** pdfjs' Util.transform, captured at load so the render path does not re-import. */
    const utilTransformRef = useRef<((m1: any, m2: any) => any[]) | null>(null)
    /** null = sidebar closed. One sidebar with two tabs rather than two competing panels. */
    const [sidebarTab, setSidebarTab] = useState<'outline' | 'thumbnails' | null>(null)

    const scrollRef = useRef<HTMLDivElement | null>(null)
    const findInputRef = useRef<HTMLInputElement | null>(null)
    const toolbarRef = useRef<HTMLDivElement | null>(null)
    const [toolbarWidth, setToolbarWidth] = useState(0)
    /** Page to re-anchor on after a zoom change, applied once the new layout exists. */
    const pendingPageRef = useRef<number | null>(null)
    /** Suppresses the scroll handler while a programmatic jump is in flight, so the jump
     *  target is not immediately overwritten by the scroll it causes. */
    const jumpingRef = useRef(false)

    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id
    /** Provider modification time, already carried by the file list. Doubles as the cache
     *  version: when the file changes upstream this changes, so the old entry is orphaned
     *  rather than served. */
    const documentVersion: string | undefined = document?.modifiedTime ?? document?.updatedAt

    const totalPages = basePages.length
    // The toolbar renders its final shape from the first frame: a zoom-only bar that later
    // grows a page group reads as the old toolbar being swapped for a new one.
    const ready = totalPages > 0

    // 1. Fetch the bytes once, then open them with pdf.js. The old pane re-fetched (and
    //    made the server re-convert) on every zoom step; here the document is loaded a
    //    single time and zoom is a local re-raster.
    useEffect(() => {
        if (!effectiveProjectId || !documentId) return

        let cancelled = false
        // Held so teardown can tear down the worker too — destroy() lives on the loading
        // task, not on the document proxy.
        let loadingTask: PDFDocumentLoadingTask | null = null
        let loadedPdf: PDFDocumentProxy | null = null

        void (async () => {
            setLoading(true)
            setFallback(false)
            setPdf(null)
            setBasePages([])
            setCurrentPage(1)
            setPageInput('1')
            setRotation(0)
            setOutline([])
            setSidebarTab(null)
            setFindOpen(false)
            setQuery('')
            setMatches([])
            setActiveMatch(0)
            pageTextRef.current = new Map()
            setTextReady(false)

            try {
                const cacheKey = documentVersion
                    ? `${effectiveProjectId}:${documentId}:${documentVersion}`
                    : null
                const cached = cacheKey ? cacheRead(cacheKey) : undefined

                let data: ArrayBuffer
                if (cached) {
                    if (!cached.bytes) {
                        // Known non-PDF — skip straight to the iframe pane without a fetch.
                        setFallback(true)
                        setLoading(false)
                        return
                    }
                    data = cached.bytes
                } else {
                    const url = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview`
                    const res = await fetch(url)
                    if (cancelled) return

                    const contentType = res.headers.get('Content-Type') ?? ''
                    if (!res.ok || !contentType.includes('application/pdf')) {
                        // Silent until now, which made a two-step degradation
                        // (grid -> pdf.js -> iframe) impossible to tell apart from the
                        // iframe pane simply being what was chosen.
                        console.info(
                            `[preview] pdf.js declined ${documentId}: status ${res.status}, content-type "${contentType}" — handing to the iframe pane`,
                        )
                        // Images and the unsupported-type HTML page keep the legacy behavior.
                        // Only a successful verdict is remembered — a transient 502 must not
                        // pin this document to the fallback pane for the rest of the session.
                        if (cacheKey && res.ok) cacheWrite(cacheKey, { contentType, bytes: null })
                        setFallback(true)
                        setLoading(false)
                        return
                    }

                    data = await res.arrayBuffer()
                    if (cancelled) return
                    if (cacheKey) cacheWrite(cacheKey, { contentType, bytes: data })
                }

                const pdfjs = await import('pdfjs-dist')
                if (cancelled) return
                // Served from public/ by scripts/copy-pdf-worker.js — never resolved by the
                // bundler, because dev runs Turbopack and the production build runs webpack.
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
                utilTransformRef.current = (m1, m2) => pdfjs.Util.transform(m1, m2)

                // pdf.js transfers this buffer to the worker and detaches it, which would
                // empty the cached copy and make the second open fail. Always hand over a
                // throwaway slice.
                loadingTask = pdfjs.getDocument({ data: data.slice(0) })
                loadedPdf = await loadingTask.promise
                if (cancelled) return

                // Measure every page upfront rather than estimating from page 1. Mixed page
                // sizes are common (a landscape exhibit inside a portrait report), and exact
                // heights are what make the scroll position -> page number math reliable.
                // getPage also warms pdf.js's own page cache for the later renders.
                const pages = await Promise.all(
                    Array.from({ length: loadedPdf.numPages }, (_, i) =>
                        loadedPdf!.getPage(i + 1).then((p) => {
                            const vp = p.getViewport({ scale: 1 })
                            return { width: vp.width, height: vp.height }
                        })
                    )
                )
                if (cancelled) return

                setBasePages(pages)
                setPdf(loadedPdf)
                setLoading(false)

                // Bookmarks are optional and must never hold up first paint, so they load
                // after the pages are on screen. Word exports headings as bookmarks, so
                // converted .docx files usually have a usable outline; many PDFs have none.
                // Text for find. Runs after first paint and yields between pages so a long
                // document does not lock the main thread; `textReady` gates the find UI so a
                // query cannot report "no results" merely because extraction is still going.
                void (async () => {
                    const map = new Map<number, PageText>()
                    for (let n = 1; n <= loadedPdf!.numPages; n++) {
                        if (cancelled) return
                        try {
                            const page = await loadedPdf!.getPage(n)
                            const content = await page.getTextContent()
                            const items: PageText['items'] = []
                            const starts: number[] = []
                            let text = ''
                            for (const raw of content.items as any[]) {
                                if (typeof raw?.str !== 'string') continue
                                starts.push(text.length)
                                items.push({ str: raw.str, transform: raw.transform, width: raw.width, height: raw.height })
                                text += raw.str
                                // pdf.js marks a visual line break on the item that ends it.
                                // Without this, the last word of one line and the first of the
                                // next concatenate into a word that is in neither.
                                if (raw.hasEOL) {
                                    starts.push(text.length)
                                    items.push({ str: '\n', transform: raw.transform, width: 0, height: raw.height })
                                    text += '\n'
                                }
                            }
                            map.set(n, { text, lower: text.toLowerCase(), starts, items })
                        } catch {
                            /* a page whose text cannot be read simply has no hits */
                        }
                    }
                    if (cancelled) return
                    pageTextRef.current = map
                    setTextReady(true)
                })()

                try {
                    const raw = await loadedPdf.getOutline()
                    if (!cancelled && Array.isArray(raw) && raw.length) {
                        setOutline(await flattenOutline(loadedPdf, raw))
                    }
                } catch {
                    /* no outline — the toggle stays hidden */
                }

            } catch (err) {
                if (cancelled) return
                console.error('[pdf-preview] failed to open document', err)
                // Encrypted, malformed, or otherwise unopenable — show the legacy pane
                // rather than an empty viewer with a broken page counter.
                setFallback(true)
                setLoading(false)
            }
        })()

        return () => {
            cancelled = true
            void loadingTask?.destroy()
        }
    }, [effectiveProjectId, documentId, documentVersion])

    useEffect(() => {
        const el = toolbarRef.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) => setToolbarWidth(entry.contentRect.width))
        ro.observe(el)
        setToolbarWidth(el.clientWidth)
        return () => ro.disconnect()
    }, [])

    // 2. Track the pane width so 100% means "page fits the pane".
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width)
            setContainerHeight(entry.contentRect.height)
        })
        ro.observe(el)
        setContainerWidth(el.clientWidth)
        setContainerHeight(el.clientHeight)
        return () => ro.disconnect()
    }, [pdf])

    // 100% fits the widest page into the pane. In a narrow side dock this is far more
    // useful than 100% meaning "actual size", and it keeps the existing 50–200% range
    // meaningful at every pane width.
    /** Page dimensions after user rotation. 90/270 swap width and height; the measured
     *  base dims already include each page's intrinsic /Rotate. */
    const rotatedPages = useMemo(() => {
        const swap = rotation % 180 !== 0
        return basePages.map((p) => ({
            width: swap ? p.height : p.width,
            height: swap ? p.width : p.height,
        }))
    }, [basePages, rotation])

    const scale = useMemo(() => {
        if (!rotatedPages.length || !containerWidth) return 0
        const widest = Math.max(...rotatedPages.map((p) => p.width))
        const fitWidth = Math.max(containerWidth - PAGE_INSET * 2, 1) / widest

        let base = fitWidth
        if (fitMode === 'page' && containerHeight) {
            // Fit the tallest page entirely in view: the smaller of the two constraints.
            const tallest = Math.max(...rotatedPages.map((p) => p.height))
            const fitHeight = Math.max(containerHeight - PAGE_GAP * 2, 1) / tallest
            base = Math.min(fitWidth, fitHeight)
        }
        return base * (zoom / 100)
    }, [rotatedPages, containerWidth, containerHeight, fitMode, zoom])

    /** Scroll offset of the top of each page, and each page's laid-out size. */
    const layout = useMemo(() => {
        const offsets: number[] = []
        const sizes: { width: number; height: number }[] = []
        let y = PAGE_GAP
        let widest = 0
        for (const p of rotatedPages) {
            offsets.push(y)
            const h = p.height * scale
            const w = p.width * scale
            sizes.push({ width: w, height: h })
            widest = Math.max(widest, w)
            y += h + PAGE_GAP
        }
        // Above 100% the pages are wider than the pane. The stack has to claim that width
        // or the overflow is unreachable: pages are centerd, so the left half would sit at
        // a negative offset that horizontal scrolling cannot get to.
        const totalWidth = Math.max(containerWidth, widest + PAGE_INSET * 2)
        return { offsets, sizes, totalHeight: y, totalWidth }
    }, [rotatedPages, scale, containerWidth])

    // 3. Current page from scroll position. Heights are exact, so a direct lookup against
    //    cumulative offsets is both cheaper and more stable than an IntersectionObserver.
    useEffect(() => {
        const el = scrollRef.current
        if (!el || !layout.offsets.length) return

        let frame = 0
        const onScroll = () => {
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                if (jumpingRef.current) return
                // The page occupying the upper third of the viewport is the one the reader
                // considers current.
                const probe = el.scrollTop + el.clientHeight / 3
                let page = 1
                for (let i = 0; i < layout.offsets.length; i++) {
                    if (layout.offsets[i] <= probe) page = i + 1
                    else break
                }
                setCurrentPage(page)
            })
        }

        el.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            el.removeEventListener('scroll', onScroll)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [layout])

    // Keep the input in step with scrolling, unless the user is mid-edit.
    useEffect(() => {
        if (!inputFocused) setPageInput(String(currentPage))
    }, [currentPage, inputFocused])

    const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = 'smooth') => {
        const el = scrollRef.current
        const offset = layout.offsets[page - 1]
        if (!el || offset === undefined) return
        jumpingRef.current = true
        setCurrentPage(page)
        el.scrollTo({ top: Math.max(offset - PAGE_GAP, 0), behavior })
        // Release once the scroll has settled; the handler is a no-op until then.
        window.setTimeout(() => { jumpingRef.current = false }, behavior === 'smooth' ? 400 : 60)
    }, [layout])

    const commitPageInput = useCallback(() => {
        const parsed = parseInt(pageInput, 10)
        if (!Number.isNaN(parsed) && basePages.length) {
            const clamped = Math.min(Math.max(parsed, 1), basePages.length)
            scrollToPage(clamped)
            setPageInput(String(clamped))
        } else {
            // Invalid entry reverts rather than jumping somewhere arbitrary.
            setPageInput(String(currentPage))
        }
    }, [pageInput, basePages.length, scrollToPage, currentPage])

    // 4. Zoom re-rasters the canvases. Hold the current page in place across the change,
    //    otherwise the reader is thrown to a different part of the document. The restore
    //    cannot happen here: `layout` is still the pre-zoom one. Record the intent and let
    //    the layout effect below run it once the new offsets exist.
    const applyZoom = useCallback((next: number) => {
        setZoom((prev) => {
            if (next !== prev) pendingPageRef.current = currentPage
            return next
        })
    }, [currentPage])

    useLayoutEffect(() => {
        if (pendingPageRef.current === null) return
        const page = pendingPageRef.current
        pendingPageRef.current = null
        scrollToPage(page, 'auto')
    }, [layout, scrollToPage])

    // Rotation and fit-mode reflow the document exactly like zoom does, so they re-anchor
    // on the current page through the same pending-page mechanism.
    const rotate = useCallback((degrees: number) => {
        pendingPageRef.current = currentPage
        setRotation((r) => (r + degrees + 360) % 360)
    }, [currentPage])

    const toggleFitMode = useCallback(() => {
        pendingPageRef.current = currentPage
        setFitMode((m) => (m === 'width' ? 'page' : 'width'))
    }, [currentPage])

    const goToPage = useCallback((page: number) => {
        if (page < 1 || page > basePages.length) return
        scrollToPage(page)
    }, [basePages.length, scrollToPage])

    // Drag-to-pan. Acrobat needs an explicit hand-vs-select toggle because dragging would
    // otherwise select text; with no text layer there is nothing to select, so panning can
    // just be what dragging does. If the text layer lands later, this is where the toggle
    // has to appear.
    const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
    const [panning, setPanning] = useState(false)

    const canPan = layout.totalWidth > containerWidth || layout.totalHeight > containerHeight

    const onPanStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // Mouse only: hijacking touch pointers would break native touch scrolling.
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        const el = scrollRef.current
        if (!el || !canPan) return
        panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
        el.setPointerCapture(e.pointerId)
        setPanning(true)
    }, [canPan])

    const onPanMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = scrollRef.current
        const start = panRef.current
        if (!el || !start) return
        el.scrollLeft = start.left - (e.clientX - start.x)
        el.scrollTop = start.top - (e.clientY - start.y)
    }, [])

    const onPanEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = scrollRef.current
        if (panRef.current && el && el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId)
        }
        panRef.current = null
        setPanning(false)
    }, [])

    const zoomIn = useCallback(() => applyZoom(Math.min(ZOOM_MAX, zoom + zoomStep(zoom))), [applyZoom, zoom])
    const zoomOut = useCallback(() => applyZoom(Math.max(ZOOM_MIN, zoom - zoomStep(zoom - 1))), [applyZoom, zoom])
    const zoomReset = useCallback(() => applyZoom(ZOOM_DEFAULT), [applyZoom])

    // Shortcuts are bound to the scroll area, not the window, so the viewer never steals
    // keys from the rest of the page. PageUp/Down move by page rather than by viewport
    // height, which is what a paged document should do.
    /** Thumbnails reuse the measured page dims, so they rotate with the document. */
    const thumbScale = useMemo(() => {
        if (!rotatedPages.length) return 0
        const widest = Math.max(...rotatedPages.map((p) => p.width))
        return THUMB_WIDTH / widest
    }, [rotatedPages])

    // Run the query across every extracted page. Debounced, because retyping a query on a
    // long document should not rescan on each keystroke.
    useEffect(() => {
        const needle = query.trim().toLowerCase()
        if (!needle || !textReady) {
            setMatches([])
            setActiveMatch(0)
            return
        }

        const timer = window.setTimeout(() => {
            const found: Match[] = []
            for (let n = 1; n <= basePages.length; n++) {
                const pageText = pageTextRef.current.get(n)
                if (!pageText) continue
                let from = 0
                for (;;) {
                    const at = pageText.lower.indexOf(needle, from)
                    if (at === -1) break
                    found.push({ page: n, start: at, end: at + needle.length })
                    from = at + needle.length
                }
            }
            setMatches(found)
            // Start from the hit nearest the page already being read, rather than dragging
            // the reader back to page 1.
            const nearest = found.findIndex((m) => m.page >= currentPage)
            setActiveMatch(found.length ? (nearest === -1 ? 0 : nearest) : 0)
        }, 200)

        return () => window.clearTimeout(timer)
        // currentPage is deliberately excluded: it changes as the user scrolls, and
        // re-running the search on every scroll would keep yanking the active hit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, textReady, basePages.length])

    /** Matches on the current page, grouped so the overlay can look them up cheaply. */
    const matchesByPage = useMemo(() => {
        const byPage = new Map<number, Array<{ match: Match; index: number }>>()
        matches.forEach((match, index) => {
            const list = byPage.get(match.page)
            if (list) list.push({ match, index })
            else byPage.set(match.page, [{ match, index }])
        })
        return byPage
    }, [matches])

    /**
     * Scroll to a hit's position, not merely to its page. Page-level navigation is useless
     * where it matters most: a spreadsheet converts to one enormous page, so every hit is on
     * page 1 and jumping to the page moves nothing at all.
     */
    const goToMatch = useCallback((index: number) => {
        if (!matches.length) return
        const wrapped = (index + matches.length) % matches.length
        setActiveMatch(wrapped)

        const target = matches[wrapped]
        const el = scrollRef.current
        const offset = layout.offsets[target.page - 1]
        if (!target || !el || offset === undefined) return

        const pageText = pageTextRef.current.get(target.page)
        const transformFn = utilTransformRef.current
        if (!pdf || !pageText || !transformFn) {
            scrollToPage(target.page)
            return
        }

        void (async () => {
            const page = await pdf.getPage(target.page)
            const viewport = page.getViewport({ scale, rotation: page.rotate + rotation })
            const rects = matchToRects(pageText, target, viewport.transform, scale, transformFn)
            if (!rects.length) {
                scrollToPage(target.page)
                return
            }
            // Land the hit a third of the way down rather than flush against the top edge,
            // so the reader sees the context it sits in.
            jumpingRef.current = true
            setCurrentPage(target.page)
            el.scrollTo({ top: Math.max(offset + rects[0].top - el.clientHeight / 3, 0), behavior: 'smooth' })
            window.setTimeout(() => { jumpingRef.current = false }, 400)
        })()
    }, [matches, layout, pdf, scale, rotation, scrollToPage])

    const closeFind = useCallback(() => {
        setFindOpen(false)
        setQuery('')
        setMatches([])
        setActiveMatch(0)
    }, [])

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement

        // Find is claimed before the input guard, so it also works from the find box itself.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            setFindOpen(true)
            window.setTimeout(() => findInputRef.current?.select(), 0)
            return
        }

        // Never swallow keys aimed at the page input or a focused button.
        if (target.closest('input, textarea, button, [contenteditable]')) return
        if (e.key === 'Escape' && findOpen) { e.preventDefault(); closeFind(); return }
        if (!ready) return

        const handlers: Record<string, () => void> = {
            PageDown: () => goToPage(currentPage + 1),
            PageUp: () => goToPage(currentPage - 1),
            Home: () => goToPage(1),
            End: () => goToPage(totalPages),
            '+': () => zoomIn(),
            '=': () => zoomIn(),
            '-': () => zoomOut(),
            '0': () => zoomReset(),
            ' ': () => goToPage(e.shiftKey ? currentPage - 1 : currentPage + 1),
        }
        const handler = handlers[e.key]
        if (!handler) return
        e.preventDefault()
        handler()
    }, [ready, currentPage, totalPages, goToPage, zoomIn, zoomOut, zoomReset, findOpen, closeFind])

    if (!effectiveProjectId || !documentId) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                Preview not available.
            </div>
        )
    }

    if (fallback) {
        return <DocumentBlobPreviewPane document={document} projectId={projectId} alternateView={alternateView} />
    }

    // Declared once so the inline buttons and the overflow menu cannot drift apart.
    const viewActions = [
        {
            key: 'reset',
            label: 'Reset zoom',
            icon: <Undo2 className="h-3.5 w-3.5" />,
            onClick: zoomReset,
            disabled: !ready || zoom === ZOOM_DEFAULT,
        },
        {
            key: 'fit',
            label: fitMode === 'width' ? 'Fit whole page' : 'Fit page width',
            icon: fitMode === 'width'
                ? <ChevronsDownUp className="h-3.5 w-3.5" />
                : <ChevronsLeftRight className="h-3.5 w-3.5" />,
            onClick: toggleFitMode,
            disabled: !ready,
        },
        {
            key: 'rotate-left',
            label: 'Rotate left',
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            onClick: () => rotate(-90),
            disabled: !ready,
        },
        {
            key: 'rotate-right',
            label: 'Rotate right',
            icon: <RotateCw className="h-3.5 w-3.5" />,
            onClick: () => rotate(90),
            disabled: !ready,
        },
    ]
    const compactToolbar = toolbarWidth > 0 && toolbarWidth < TOOLBAR_COMPACT_BELOW

    const renderAhead = zoom > 300 ? RENDER_AHEAD_EXTREME_ZOOM
        : zoom > 200 ? RENDER_AHEAD_HIGH_ZOOM
        : RENDER_AHEAD
    const firstVisible = Math.max(1, currentPage - renderAhead)
    const lastVisible = Math.min(totalPages, currentPage + renderAhead)

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Toolbar: zoom on the left, page position on the right */}
            <div ref={toolbarRef} className="flex flex-wrap items-center justify-center gap-1 px-3 py-1.5 bg-white border-b border-[#e5e7eb] shrink-0">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setSidebarTab((t) => (t ? null : outline.length ? 'outline' : 'thumbnails'))}
                            disabled={!ready}
                            className={`h-6 w-6 rounded inline-flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed ${sidebarTab ? 'text-slate-900 bg-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                            aria-label={sidebarTab ? 'Hide sidebar' : 'Show page thumbnails and bookmarks'}
                            aria-pressed={Boolean(sidebarTab)}
                        >
                            <PanelLeft className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                        {sidebarTab ? 'Hide sidebar' : 'Thumbnails & bookmarks'}
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => {
                                if (findOpen) { closeFind(); return }
                                setFindOpen(true)
                                window.setTimeout(() => findInputRef.current?.focus(), 0)
                            }}
                            disabled={!ready}
                            className={`h-6 w-6 rounded inline-flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed ${findOpen ? 'text-slate-900 bg-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                            aria-label={findOpen ? 'Close find' : 'Find in document'}
                            aria-pressed={findOpen}
                        >
                            <Search className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Find in document</TooltipContent>
                </Tooltip>

                <div className="w-px h-4 bg-slate-200 mx-1.5" aria-hidden="true" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={zoomOut}
                            disabled={!ready || zoom <= ZOOM_MIN}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Zoom out</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            disabled={!ready}
                            className="min-w-[3.25rem] h-6 px-1.5 rounded inline-flex items-center justify-center gap-0.5 text-[10px] font-mono text-slate-600 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed tabular-nums"
                            aria-label={`Zoom ${zoom} percent. Choose a zoom level.`}
                        >
                            {zoom}%
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-[5rem]">
                        {ZOOM_PRESETS.map((preset) => (
                            <DropdownMenuItem
                                key={preset}
                                onSelect={() => applyZoom(preset)}
                                className={`text-xs font-mono tabular-nums justify-center ${preset === zoom ? 'font-semibold text-slate-900' : ''}`}
                            >
                                {preset}%
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={zoomIn}
                            disabled={!ready || zoom >= ZOOM_MAX}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Zoom in</TooltipContent>
                </Tooltip>

                {compactToolbar ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                disabled={!ready}
                                className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                aria-label="View options"
                            >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                            {viewActions.map((action) => (
                                <DropdownMenuItem
                                    key={action.key}
                                    onSelect={action.onClick}
                                    disabled={action.disabled}
                                    className="text-xs gap-2"
                                >
                                    {action.icon}
                                    {action.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    viewActions.map((action) => (
                        <Tooltip key={action.key}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                    className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                    aria-label={action.label}
                                >
                                    {action.icon}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{action.label}</TooltipContent>
                        </Tooltip>
                    ))
                )}

                <div className="w-px h-4 bg-slate-200 mx-1.5" aria-hidden="true" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={!ready || currentPage <= 1}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Previous page"
                        >
                            <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Previous page</TooltipContent>
                </Tooltip>

                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-600 tabular-nums">
                    <label htmlFor="pdf-page-input" className="sr-only">Go to page</label>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <input
                                id="pdf-page-input"
                                type="text"
                                inputMode="numeric"
                                value={ready ? pageInput : ''}
                                onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                                disabled={!ready}
                                onFocus={(e) => { setInputFocused(true); e.target.select() }}
                                onBlur={() => { setInputFocused(false); commitPageInput() }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                                    if (e.key === 'Escape') { setPageInput(String(currentPage)); e.currentTarget.blur() }
                                }}
                                className="w-9 h-6 px-1 text-center rounded border border-slate-200 bg-white text-[10px] font-mono tabular-nums text-slate-700 hover:border-slate-300 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:opacity-40 disabled:hover:border-slate-200"
                                aria-label={ready ? `Page ${currentPage} of ${totalPages}. Type a page number to jump.` : 'Go to page'}
                            />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Go to page</TooltipContent>
                    </Tooltip>
                    <span className="text-slate-400">/</span>
                    <span>{ready ? totalPages : '–'}</span>
                </div>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={!ready || currentPage >= totalPages}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Next page"
                        >
                            <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Next page</TooltipContent>
                </Tooltip>

                {alternateView && (
                    <>
                        {/* ml-auto on the group pins the separator, icon and label together
                            against the right edge; the toolbar's flex-wrap drops the whole
                            group to its own line only when there is no room for it. */}
                        <div className="ml-auto flex items-center gap-1.5">
                            <div className="w-px h-4 bg-slate-200" aria-hidden="true" />
                            <button
                                type="button"
                                onClick={alternateView.onSelect}
                                className="h-6 px-2 rounded inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            >
                                <Table2 className="h-3.5 w-3.5" />
                                {alternateView.label}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {findOpen && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-[#e5e7eb] shrink-0">
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input
                        ref={findInputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); goToMatch(activeMatch + (e.shiftKey ? -1 : 1)) }
                            if (e.key === 'Escape') { e.preventDefault(); closeFind() }
                        }}
                        placeholder={textReady ? 'Find in document' : 'Reading document…'}
                        disabled={!textReady}
                        className="flex-1 min-w-0 h-6 px-1.5 rounded border border-slate-200 bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:bg-slate-50"
                        aria-label="Find in document"
                    />

                    <span className="shrink-0 text-[10px] font-mono tabular-nums text-slate-500 min-w-[3.5rem] text-right">
                        {!query.trim() ? '' : matches.length ? `${activeMatch + 1} / ${matches.length}` : 'No results'}
                    </span>

                    <button
                        type="button"
                        onClick={() => goToMatch(activeMatch - 1)}
                        disabled={!matches.length}
                        className="h-6 w-6 shrink-0 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        aria-label="Previous match"
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => goToMatch(activeMatch + 1)}
                        disabled={!matches.length}
                        className="h-6 w-6 shrink-0 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        aria-label="Next match"
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={closeFind}
                        className="h-6 w-6 shrink-0 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        aria-label="Close find"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Sidebar + page area */}
            <div className="flex-1 min-h-0 flex">
                {sidebarTab && ready && pdf && (
                    <div
                        className="shrink-0 flex flex-col border-r border-[#e5e7eb] bg-white"
                        style={{ width: SIDEBAR_WIDTH }}
                    >
                        {/* Tabs. Outline is offered only when the document actually has one. */}
                        <div className="flex shrink-0 border-b border-[#e5e7eb]">
                            {outline.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSidebarTab('outline')}
                                    className={`flex-1 h-7 inline-flex items-center justify-center gap-1 text-[10px] font-medium ${sidebarTab === 'outline' ? 'text-slate-900 border-b-2 border-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <List className="h-3 w-3" /> Bookmarks
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setSidebarTab('thumbnails')}
                                className={`flex-1 h-7 inline-flex items-center justify-center gap-1 text-[10px] font-medium ${sidebarTab === 'thumbnails' ? 'text-slate-900 border-b-2 border-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <PanelLeft className="h-3 w-3" /> Pages
                            </button>
                        </div>

                        {sidebarTab === 'outline' ? (
                            <div className="flex-1 min-h-0 overflow-auto py-1">
                                {outline.map((entry, i) => (
                                    <button
                                        key={`${i}-${entry.title}`}
                                        type="button"
                                        onClick={() => entry.pageNumber && scrollToPage(entry.pageNumber)}
                                        disabled={!entry.pageNumber}
                                        title={entry.title}
                                        className="w-full text-left px-2 py-1 text-[11px] leading-snug text-slate-700 hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-default flex gap-1.5"
                                        style={{ paddingLeft: 8 + entry.depth * 10 }}
                                    >
                                        <span className="flex-1 truncate">{entry.title}</span>
                                        {entry.pageNumber && (
                                            <span className="shrink-0 text-[10px] font-mono tabular-nums text-slate-400">
                                                {entry.pageNumber}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div data-thumb-strip className="flex-1 min-h-0 overflow-auto px-2">
                                {rotatedPages.map((p, i) => (
                                    <PdfThumb
                                        key={i + 1}
                                        pdf={pdf}
                                        pageNumber={i + 1}
                                        width={Math.round(p.width * thumbScale)}
                                        height={Math.round(p.height * thumbScale)}
                                        rotation={rotation}
                                        scale={thumbScale}
                                        active={currentPage === i + 1}
                                        onSelect={() => scrollToPage(i + 1)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

            <div className="flex-1 min-h-0 relative bg-[#f3f4f6]">
                {loading && <PreviewLoadingState document={document} />}

                <div
                    ref={scrollRef}
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    onPointerDown={onPanStart}
                    onPointerMove={onPanMove}
                    onPointerUp={onPanEnd}
                    onPointerCancel={onPanEnd}
                    className="absolute inset-0 overflow-auto focus:outline-none"
                    // A reserved gutter keeps the measured width constant whether or not the
                    // vertical scrollbar is showing. Without it, fit-to-width scale and
                    // scrollbar visibility can chase each other on a document that lands
                    // within a scrollbar's width of fitting exactly.
                    style={{
                        scrollbarGutter: 'stable',
                        cursor: canPan ? (panning ? 'grabbing' : 'grab') : undefined,
                    }}
                >
                    {pdf && scale > 0 && (
                        <div className="relative mx-auto" style={{ height: layout.totalHeight, width: layout.totalWidth }}>
                            {basePages.map((_, i) => {
                                const pageNumber = i + 1
                                const size = layout.sizes[i]
                                const inWindow = pageNumber >= firstVisible && pageNumber <= lastVisible
                                return (
                                    <div
                                        key={pageNumber}
                                        data-page={pageNumber}
                                        className="absolute left-1/2 -translate-x-1/2 bg-white shadow-sm"
                                        style={{ top: layout.offsets[i], width: size.width, height: size.height }}
                                    >
                                        {inWindow && (
                                            <>
                                                <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} rotation={rotation} />
                                                <PdfPageHighlights
                                                    pdf={pdf}
                                                    pageNumber={pageNumber}
                                                    scale={scale}
                                                    rotation={rotation}
                                                    pageText={pageTextRef.current.get(pageNumber)}
                                                    hits={matchesByPage.get(pageNumber) ?? EMPTY_HITS}
                                                    activeMatch={activeMatch}
                                                    transformFn={utilTransformRef.current}
                                                />
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </div>
    )
}
