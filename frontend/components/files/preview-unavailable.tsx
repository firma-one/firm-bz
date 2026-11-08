'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { failureFrom, failureReason } from '@/lib/files/action-failure'

/**
 * What a preview pane shows when the file couldn't be shown: "Preview not available" with the reason
 * (the storage's words, from the preview route) and Reload. Never raw JSON in the pane, a broken
 * image icon or a black video frame (P1-39, P1-40).
 */
export function PreviewUnavailable({ reason, onReload, dark = false }: { reason?: string | null; onReload?: () => void; dark?: boolean }) {
    return (
        <div role="alert" className={`flex-1 min-h-0 flex flex-col items-center justify-center gap-2 p-6 text-center ${dark ? 'bg-[#f3f4f6]' : ''}`}>
            <AlertCircle className="h-6 w-6 text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-700">Preview not available</p>
            <p className="max-w-[320px] text-xs leading-relaxed text-slate-500">{reason || "This file couldn't be shown here. Download it to open it."}</p>
            {onReload && (
                <button
                    type="button"
                    onClick={onReload}
                    className="mt-1 inline-flex h-7 items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Reload
                </button>
            )}
        </div>
    )
}

/**
 * The reason an <img>, <video> or <audio> pointed at the preview route didn't load. The element only
 * says that it failed, so the route is asked again for its answer: a refusal comes back as
 * `{ error }`, in the storage's words.
 */
export async function previewFailureReason(src: string): Promise<string> {
    try {
        const res = await fetch(src, { headers: { Range: 'bytes=0-0' } })
        if (!res.ok) return (await failureFrom(res)).message
        return "This file couldn't be shown here. Download it to open it."
    } catch (e) {
        return failureReason(e)
    }
}

/**
 * State for a media element's failure: `fail()` is its onError, `reason` the words once known, and
 * `reload()` tries again with a fresh request (`attempt` keys the element).
 */
export function useMediaFailure(src: string | null) {
    const [failed, setFailed] = useState(false)
    const [reason, setReason] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)
    useEffect(() => { setFailed(false); setReason(null) }, [src])
    const fail = () => {
        if (!src || failed) return
        setFailed(true)
        void previewFailureReason(src).then(setReason)
    }
    const reload = () => {
        setFailed(false)
        setReason(null)
        setAttempt((n) => n + 1)
    }
    return { failed, reason, fail, reload, attempt }
}
