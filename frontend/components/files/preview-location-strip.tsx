'use client'

import { ExternalLink, Folder, FolderOpen } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { useRightPane } from '@/lib/right-pane-context'
import { cn } from '@/lib/utils'

const ICON_ACTION =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-line-strong'
const ICON_ACTION_ON = 'text-fg-muted hover:bg-surface-hover hover:text-fg'

interface PreviewLocationStripProps {
    /** The document's folders, root first. */
    folderPath: string[]
    /** Where Open in Files goes (a new tab, as from search and the Documents list). None hides it. */
    filesUrl: string | null
    /** Names the storage: "Open in OneDrive". */
    openLabel: string
    onOpen?: () => void
    /** Why Open is off, shown on hover in place of its name. */
    openOffReason?: string | null
}

/**
 * Where a previewed document lives and how to start work on it, under the pane's header: its folders,
 * Open in Files, and Open. A preview opened away from Files has no row beside it to offer these.
 */
export function PreviewLocationStrip({ folderPath, filesUrl, openLabel, onOpen, openOffReason }: PreviewLocationStripProps) {
    const { paneSize } = useRightPane()
    // At 320px the nearest folders are the ones that say where it is. The whole path is on hover.
    const shownPath = paneSize === 'small' && folderPath.length > 2 ? ['…', ...folderPath.slice(-2)] : folderPath
    const fullPath = folderPath.join(' / ')
    const pathContent = (
        <>
            <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{shownPath.join(' / ')}</span>
        </>
    )
    const off = !!openOffReason

    return (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pl-3 pr-2">
            <div className="mr-1 flex min-w-0 flex-1 items-center">
                {folderPath.length > 0 && (filesUrl ? (
                    <Hint label={fullPath}>
                        <a
                            href={filesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open in Files: ${fullPath}`}
                            className="flex min-w-0 items-center gap-1.5 rounded-control text-small text-fg-muted outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-line-strong"
                        >
                            {pathContent}
                        </a>
                    </Hint>
                ) : (
                    <span className="flex min-w-0 items-center gap-1.5 text-small text-fg-muted">{pathContent}</span>
                ))}
            </div>
            {filesUrl && (
                <Hint label="Open in Files">
                    <a href={filesUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Files" className={cn(ICON_ACTION, ICON_ACTION_ON)}>
                        <FolderOpen className="h-4 w-4" aria-hidden />
                    </a>
                </Hint>
            )}
            {onOpen && (
                <Hint label={openOffReason ?? openLabel}>
                    <button
                        type="button"
                        aria-label={openLabel}
                        aria-disabled={off || undefined}
                        onClick={off ? undefined : onOpen}
                        className={cn(ICON_ACTION, off ? 'cursor-not-allowed text-fg-subtle' : ICON_ACTION_ON)}
                    >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                    </button>
                </Hint>
            )}
        </div>
    )
}
