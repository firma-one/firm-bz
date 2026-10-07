'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, ChevronUp, ChevronDown, ChevronsLeftRight, ChevronsDownUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { DocumentBlobPreviewPane } from '@/components/files/document-blob-preview-pane'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

const ZOOM_STEP = 15
const ZOOM_MIN = 50
const ZOOM_MAX = 200
const ZOOM_DEFAULT = 100
/** Offered in the zoom dropdown. Kept inside ZOOM_MIN..ZOOM_MAX so the +/- buttons, the
 *  dropdown and the reset button can never disagree about the allowed range. */
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200]

/** Pages rendered to canvas on either side of the current page. Everything else is a
 *  correctly-sized placeholder, so scrolling never shifts and memory stays bounded. */
const RENDER_AHEAD = 2

/** Vertical gap between pages, and the horizontal breathing room used when fitting a
 *  page to the pane width. Both in CSS px. */
const PAGE_GAP = 12
const PAGE_INSET = 16

interface DocumentPdfPreviewPaneProps {
    document: any
    projectId?: string
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
                // sharp on retina displays instead of being upscaled from a 1x bitmap.
                const dpr = window.devicePixelRatio || 1
                canvas.width = Math.floor(viewport.width * dpr)
                canvas.height = Math.floor(viewport.height * dpr)
                canvas.style.width = `${Math.floor(viewport.width)}px`
                canvas.style.height = `${Math.floor(viewport.height)}px`

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

export function DocumentPdfPreviewPane({ document, projectId }: DocumentPdfPreviewPaneProps) {
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
    /** 'width' reproduces the original behaviour and stays the default. */
    const [fitMode, setFitMode] = useState<'width' | 'page'>('width')
    /** User rotation in degrees, composed on top of each page's intrinsic /Rotate. */
    const [rotation, setRotation] = useState(0)

    const scrollRef = useRef<HTMLDivElement | null>(null)
    /** Page to re-anchor on after a zoom change, applied once the new layout exists. */
    const pendingPageRef = useRef<number | null>(null)
    /** Suppresses the scroll handler while a programmatic jump is in flight, so the jump
     *  target is not immediately overwritten by the scroll it causes. */
    const jumpingRef = useRef(false)

    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

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

            try {
                const url = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview`
                const res = await fetch(url)
                if (cancelled) return

                const contentType = res.headers.get('Content-Type') ?? ''
                if (!res.ok || !contentType.includes('application/pdf')) {
                    // Images and the unsupported-type HTML page keep the legacy behaviour.
                    setFallback(true)
                    setLoading(false)
                    return
                }

                const data = await res.arrayBuffer()
                if (cancelled) return

                const pdfjs = await import('pdfjs-dist')
                if (cancelled) return
                // Served from public/ by scripts/copy-pdf-worker.js — never resolved by the
                // bundler, because dev runs Turbopack and the production build runs webpack.
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

                // NOTE: pdf.js transfers `data` to the worker, detaching the ArrayBuffer.
                // It must not be read again after this call.
                loadingTask = pdfjs.getDocument({ data })
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
    }, [effectiveProjectId, documentId])

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
        // or the overflow is unreachable: pages are centred, so the left half would sit at
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
    const rotate = useCallback(() => {
        pendingPageRef.current = currentPage
        setRotation((r) => (r + 90) % 360)
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

    const zoomIn = useCallback(() => applyZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP)), [applyZoom, zoom])
    const zoomOut = useCallback(() => applyZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP)), [applyZoom, zoom])
    const zoomReset = useCallback(() => applyZoom(ZOOM_DEFAULT), [applyZoom])

    if (!effectiveProjectId || !documentId) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                Preview not available.
            </div>
        )
    }

    if (fallback) {
        return <DocumentBlobPreviewPane document={document} projectId={projectId} />
    }

    const totalPages = basePages.length
    // The toolbar renders its final shape from the first frame: a zoom-only bar that later
    // grows a page group reads as the old toolbar being swapped for a new one.
    const ready = totalPages > 0
    const firstVisible = Math.max(1, currentPage - RENDER_AHEAD)
    const lastVisible = Math.min(totalPages, currentPage + RENDER_AHEAD)

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Toolbar: zoom on the left, page position on the right */}
            <div className="flex flex-wrap items-center justify-center gap-1 px-3 py-1.5 bg-white border-b border-[#e5e7eb] shrink-0">
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
                    <TooltipContent side="bottom" className="z-[110] text-xs">Zoom out</TooltipContent>
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
                    <DropdownMenuContent align="center" className="z-[110] min-w-[5rem]">
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
                    <TooltipContent side="bottom" className="z-[110] text-xs">Zoom in</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={zoomReset}
                            disabled={!ready || zoom === ZOOM_DEFAULT}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Reset zoom"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-[110] text-xs">Reset zoom</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={toggleFitMode}
                            disabled={!ready}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label={fitMode === 'width' ? 'Fit whole page' : 'Fit page width'}
                        >
                            {fitMode === 'width'
                                ? <ChevronsDownUp className="h-3.5 w-3.5" />
                                : <ChevronsLeftRight className="h-3.5 w-3.5" />}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-[110] text-xs">
                        {fitMode === 'width' ? 'Fit whole page' : 'Fit page width'}
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={rotate}
                            disabled={!ready}
                            className="h-6 w-6 rounded inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            aria-label="Rotate 90 degrees clockwise"
                        >
                            <RotateCw className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-[110] text-xs">Rotate 90&deg;</TooltipContent>
                </Tooltip>

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
                    <TooltipContent side="bottom" className="z-[110] text-xs">Previous page</TooltipContent>
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
                        <TooltipContent side="bottom" className="z-[110] text-xs">Go to page</TooltipContent>
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
                    <TooltipContent side="bottom" className="z-[110] text-xs">Next page</TooltipContent>
                </Tooltip>
            </div>

            {/* Page area */}
            <div className="flex-1 min-h-0 relative bg-[#f3f4f6]">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#f3f4f6] z-10">
                        <LoadingSpinner size="md" />
                    </div>
                )}

                <div
                    ref={scrollRef}
                    onPointerDown={onPanStart}
                    onPointerMove={onPanMove}
                    onPointerUp={onPanEnd}
                    onPointerCancel={onPanEnd}
                    className="absolute inset-0 overflow-auto"
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
                                        {inWindow && <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} rotation={rotation} />}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
