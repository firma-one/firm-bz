'use client'

import { useEffect, useRef, useState } from 'react'
import { Folder, File as FileIcon } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface ArchiveEntry {
    path: string
    depth: number
    isFolder: boolean
    size: number
}

interface DocumentArchivePreviewPaneProps {
    document: any
    projectId?: string
    onFallback: (reason: string) => void
}

function formatBytes(bytes: number): string {
    if (!bytes) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
    return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * Lists what is inside a zip. It does not extract anything — the point is to answer "what
 * did they send me?" without a download, which beats the "cannot be displayed" card an
 * archive got before.
 */
export function DocumentArchivePreviewPane({ document, projectId, onFallback }: DocumentArchivePreviewPaneProps) {
    const [entries, setEntries] = useState<ArchiveEntry[]>([])
    const [loading, setLoading] = useState(true)

    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

    const onFallbackRef = useRef(onFallback)
    useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])

    useEffect(() => {
        if (!effectiveProjectId || !documentId) return
        let cancelled = false

        void (async () => {
            setLoading(true)
            try {
                const res = await fetch(
                    `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview?native=1`
                )
                if (cancelled) return
                if (!res.ok) {
                    onFallbackRef.current(`preview request failed (${res.status})`)
                    return
                }

                const data = await res.arrayBuffer()
                if (cancelled) return

                // Check the signature before handing it to a zip parser. A file named .zip
                // is not necessarily one: a download that actually returned an error or
                // redirect page keeps the extension, and the parser's complaint about a
                // missing central directory says nothing useful about what went wrong.
                const signature = new Uint8Array(data.slice(0, 2))
                if (!(signature[0] === 0x50 && signature[1] === 0x4b)) {
                    const looksLikeHtml = new TextDecoder()
                        .decode(data.slice(0, 64))
                        .trimStart()
                        .toLowerCase()
                        .startsWith('<!doctype')
                    onFallbackRef.current(
                        looksLikeHtml
                            ? 'the file is an HTML page, not an archive — the upload probably captured a download page'
                            : 'the file does not start with a zip signature',
                    )
                    return
                }

                // Already a dependency — the workbook trimmer uses it server-side.
                const JSZip = (await import('jszip')).default
                const zip = await JSZip.loadAsync(data)
                if (cancelled) return

                const list: ArchiveEntry[] = []
                zip.forEach((path, entry) => {
                    const trimmed = path.replace(/\/$/, '')
                    if (!trimmed) return
                    // Skip the metadata archivers leave behind; it is noise, not content.
                    if (trimmed.startsWith('__MACOSX/') || trimmed.endsWith('/.DS_Store')) return
                    list.push({
                        path: trimmed,
                        depth: trimmed.split('/').length - 1,
                        isFolder: entry.dir,
                        size: (entry as any)._data?.uncompressedSize ?? 0,
                    })
                })
                list.sort((a, b) => a.path.localeCompare(b.path))

                setEntries(list)
                setLoading(false)
            } catch (err) {
                if (cancelled) return
                console.error('[archive-preview] could not read archive', err)
                onFallbackRef.current('archive could not be read')
            }
        })()

        return () => { cancelled = true }
    }, [effectiveProjectId, documentId])

    if (loading) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center bg-[#f3f4f6]">
                <LoadingSpinner size="md" />
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white">
            <div className="shrink-0 px-3 py-1.5 border-b border-[#e5e7eb] text-[11px] text-slate-500">
                {entries.length} {entries.length === 1 ? 'item' : 'items'} in this archive
            </div>
            <div className="flex-1 min-h-0 overflow-auto py-1">
                {entries.map((entry) => (
                    <div
                        key={entry.path}
                        className="flex items-center gap-2 px-3 py-1 text-[12px] text-slate-700 hover:bg-slate-50"
                        style={{ paddingLeft: 12 + entry.depth * 14 }}
                    >
                        {entry.isFolder
                            ? <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            : <FileIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span className="flex-1 truncate" title={entry.path}>
                            {entry.path.split('/').pop()}
                        </span>
                        {!entry.isFolder && (
                            <span className="shrink-0 text-[10px] font-mono tabular-nums text-slate-400">
                                {formatBytes(entry.size)}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
