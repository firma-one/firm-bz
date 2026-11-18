'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { BRAND_NAME } from '@/config/brand'
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon'
import { BrandName } from '@/components/brand/BrandName'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { WorkspaceLoaderMark } from '@/components/app/workspace-loader'
import {
    holdingTabChannelName,
    parseHoldingTabHash,
    providerName,
    providerPlace,
    type HoldingTabInfo,
    type HoldingTabMessage,
    type SecureOpenProvider,
} from '@/lib/secure-open/holding-tab'

/** After this long, the line says it can take a while (a OneDrive grant has taken 16s). */
export const SLOW_AFTER_MS = 6_000

type Phase =
    | { kind: 'waiting' }
    | { kind: 'done'; provider?: SecureOpenProvider }
    | { kind: 'error'; reason: string; retry: boolean }

/**
 * The page at `/open` (lib/secure-open/holding-tab.ts): Firma's own tab while a document's access is
 * checked, in the workspace loader's language. It shows what the hook in the opening tab tells it and
 * never acts on access or navigates by itself; the hook points this tab at the document.
 */
export function SecureOpenHoldingPage() {
    // Read on mount: the hash is only in the browser. Undefined until then, null when it isn't ours.
    const [info, setInfo] = useState<HoldingTabInfo | null | undefined>(undefined)
    const [phase, setPhase] = useState<Phase>({ kind: 'waiting' })
    const [slow, setSlow] = useState(false)
    const channelRef = useRef<BroadcastChannel | null>(null)

    useEffect(() => {
        const parsed = parseHoldingTabHash(window.location.hash)
        setInfo(parsed)
        if (!parsed || typeof BroadcastChannel === 'undefined') return
        const channel = new BroadcastChannel(holdingTabChannelName(parsed.key))
        channelRef.current = channel
        channel.onmessage = (e: MessageEvent<HoldingTabMessage>) => {
            const m = e.data
            if (!m || m.type !== 'state') return
            if (m.state === 'waiting') setPhase({ kind: 'waiting' })
            else if (m.state === 'done') setPhase({ kind: 'done', provider: m.provider })
            else if (m.state === 'error' && typeof m.reason === 'string') {
                setPhase({ kind: 'error', reason: m.reason, retry: m.retry === true })
            }
        }
        channel.postMessage({ type: 'ready' } satisfies HoldingTabMessage)
        return () => {
            channel.close()
            channelRef.current = null
        }
    }, [])

    // The slow line, counted afresh for each wait (Try again starts a new one).
    useEffect(() => {
        if (phase.kind !== 'waiting') return
        setSlow(false)
        const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
        return () => clearTimeout(t)
    }, [phase])

    const fileName = info?.fileName
    useEffect(() => {
        document.title = phase.kind === 'error'
            ? fileName ? `Couldn't open ${fileName} · ${BRAND_NAME}` : `Couldn't open the document · ${BRAND_NAME}`
            : fileName ? `Opening ${fileName} · ${BRAND_NAME}` : `Opening a document · ${BRAND_NAME}`
    }, [phase.kind, fileName])

    const retry = useCallback(() => {
        channelRef.current?.postMessage({ type: 'retry' } satisfies HoldingTabMessage)
        setPhase({ kind: 'waiting' })
    }, [])

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-surface text-fg">
            <div className="absolute left-5 top-4 flex items-center gap-1.5">
                <BrandMarkIcon className="h-[18px] w-[18px]" />
                <BrandName className="text-[15px] leading-none" />
            </div>
            {info === null ? (
                <NotFromFirma />
            ) : phase.kind === 'error' ? (
                <div role="alert" className="flex w-full max-w-[400px] flex-col items-center gap-3.5 px-4 text-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-control bg-tag-red-bg text-tag-red-fg">
                        <AlertCircle className="h-4 w-4" aria-hidden />
                    </div>
                    <h1 className="text-[15px] font-semibold text-fg">Couldn&rsquo;t open this document</h1>
                    {info && <FileCard info={info} />}
                    <p className="text-small leading-relaxed text-fg">{phase.reason}</p>
                    <div className="flex justify-center gap-2">
                        <BackToFirma />
                        {phase.retry && <Button size="sm" onClick={retry}>Try again</Button>}
                    </div>
                </div>
            ) : (
                <div role="status" aria-live="polite" className="flex w-full max-w-[400px] flex-col items-center gap-3.5 px-4 text-center">
                    <WorkspaceLoaderMark state={phase.kind === 'done' ? 'done' : 'loading'} />
                    {info && <FileCard info={info} />}
                    <StatusLine phase={phase} slow={slow} provider={info?.provider} />
                </div>
            )}
        </div>
    )
}

function StatusLine({ phase, slow, provider }: { phase: Phase; slow: boolean; provider?: SecureOpenProvider }) {
    if (phase.kind === 'done') {
        const p = phase.provider ?? provider
        return (
            <p className="text-ui text-fg-muted">
                <span className="font-medium text-fg">Access ready</span>
                {p ? ` · opening ${providerName(p)}` : ' · opening the document'}
            </p>
        )
    }
    if (slow) {
        return (
            <div className="space-y-1">
                <p className="text-ui text-fg-muted">Still working · this can take a moment the first time</p>
                <p className="text-small text-fg-muted">This tab moves to the document on its own.</p>
            </div>
        )
    }
    return (
        <p className="text-ui text-fg-muted">
            {provider ? `Checking your access, then opening it in ${providerName(provider)}` : 'Checking your access, then opening it'}
        </p>
    )
}

function FileCard({ info }: { info: HoldingTabInfo }) {
    return (
        <div className="flex w-full items-center gap-2.5 rounded-card border border-line p-2 text-left">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                <DocumentIcon mimeType={info.mimeType} size={22} />
            </div>
            <div className="min-w-0">
                <p className="truncate text-small font-medium text-fg" title={info.fileName}>{info.fileName}</p>
                {info.provider && <p className="truncate text-caption text-fg-muted">{providerPlace(info.provider)}</p>}
            </div>
        </div>
    )
}

/**
 * Closes this tab, which Firma opened, back onto the page it came from. A tab the browser won't
 * close (opened some other way) goes to the app instead.
 */
function BackToFirma() {
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={() => {
                window.close()
                setTimeout(() => { if (!window.closed) window.location.assign('/d') }, 150)
            }}
        >
            Back to {BRAND_NAME}
        </Button>
    )
}

/** Reached without a document to open (a bookmark, a reload of an old tab). */
function NotFromFirma() {
    return (
        <div role="status" className="flex w-full max-w-[400px] flex-col items-center gap-3.5 px-4 text-center">
            <p className="text-ui text-fg-muted">There&rsquo;s nothing to open here. Open the document again from its engagement.</p>
            <BackToFirma />
        </div>
    )
}
