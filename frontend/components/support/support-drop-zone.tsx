"use client"

import { useId, useRef, useState } from "react"
import { Paperclip, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_SUPPORT_ATTACHMENT_BYTES } from "@/lib/support-attachment-upload"
import { formatBytes } from "./support-bits"

/*
 * Where files go on a support request (.claude/plans/app-design-refinements.md, section 14): a large,
 * plainly marked target — drop here, or Browse files — rather than a line of small print. Files over
 * the server's 8 MB limit are turned away here, with a reason, instead of failing after the upload.
 */

export function SupportDropZone({
    onFiles,
    disabled = false,
    compact = false,
    className,
}: {
    onFiles: (files: File[]) => void
    disabled?: boolean
    /** A slimmer zone, for adding files to a request already sent. */
    compact?: boolean
    className?: string
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const hintId = useId()
    const [over, setOver] = useState(false)
    const [rejected, setRejected] = useState<string | null>(null)

    const take = (list: FileList | null) => {
        const files = Array.from(list ?? [])
        if (files.length === 0) return
        const tooBig = files.filter((f) => f.size > MAX_SUPPORT_ATTACHMENT_BYTES)
        setRejected(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${formatBytes(MAX_SUPPORT_ATTACHMENT_BYTES)}` : null)
        const ok = files.filter((f) => f.size <= MAX_SUPPORT_ATTACHMENT_BYTES)
        if (ok.length) onFiles(ok)
    }

    return (
        <div className={className}>
            <div
                onDragOver={(e) => {
                    if (disabled) return
                    e.preventDefault()
                    setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setOver(false)
                    if (!disabled) take(e.dataTransfer.files)
                }}
                aria-describedby={hintId}
                className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed text-center transition-colors",
                    compact ? "h-16 flex-row gap-3" : "h-28",
                    over ? "border-action bg-action/[0.06]" : "border-line-strong bg-surface-subtle",
                    disabled && "opacity-60"
                )}
            >
                {!compact && <Upload aria-hidden className={cn("h-5 w-5", over ? "text-action" : "text-fg-subtle")} />}
                <p id={hintId} className="text-ui font-medium text-fg">
                    {over ? "Drop to attach" : compact ? "Drop files here" : "Drop screenshots or files here"}
                </p>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-small font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                    <Paperclip aria-hidden className="h-3.5 w-3.5" /> Browse files
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        take(e.target.files)
                        e.target.value = ""
                    }}
                />
            </div>
            {rejected && <p className="mt-1.5 text-caption text-danger">{rejected}</p>}
        </div>
    )
}
