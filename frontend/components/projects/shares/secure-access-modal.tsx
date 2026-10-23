'use client'

import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Mail, AlertCircle, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import type { SecureOpenModalMode } from '@/lib/use-secure-open-document'

interface SecureAccessModalProps {
    isOpen: boolean
    onClose: () => void
    email: string
    fileName: string
    mimeType?: string
    externalId?: string
    firmId?: string
    /** Target for the manual link shown in 'blocked' mode. */
    documentUrl?: string
    /** 'loading' (generic, provider-neutral, shown before the provider is known) | 'opening'
     *  (OneDrive/SharePoint — auto-closes) | 'opened' (Google, opened directly — stays open with
     *  "Email me a new access link") | 'email' (Google — stays open) | 'blocked' (the browser
     *  refused the new tab; user clicks the link themselves) | 'error'. Falls back to the old
     *  isLoading/error boolean props' behavior when omitted. */
    mode?: SecureOpenModalMode
    isLoading?: boolean
    error?: string | null
    /** "Email me a new access link" in the 'opened' state (useSecureOpenDocument's requestNewAccessLink). */
    onRequestNewLink?: () => void
}

/** Each state's heading: the visible title is also the dialog's accessible name. */
const HEADINGS: Record<SecureOpenModalMode, { title: string; subtitle: (email: string) => string }> = {
    loading: { title: 'Preparing secure access', subtitle: () => 'Checking your access, one moment…' },
    opening: { title: 'Opening document', subtitle: () => 'Opening in a new tab…' },
    opened: { title: 'Opened in a new tab', subtitle: () => 'Your access is ready' },
    blocked: { title: 'Ready to open', subtitle: () => 'Your access is ready — one more click' },
    email: { title: 'Check your email', subtitle: (email) => `A verification link was sent to ${email}` },
    error: { title: 'Access unavailable', subtitle: () => 'We couldn’t open this document' },
}

/**
 * Opening a document through a per-person grant (lib/use-secure-open-document.ts), in the
 * ConfirmDialog's Linear-style layout (.claude/plans/ui-ux-overhaul.md, Phase 6): an icon tile, a
 * sentence-case title and subtitle, the body under the title, buttons bottom-right. The spinner in
 * the tile is the only busy indicator; while busy there are no buttons, since nothing can be done.
 */
export function SecureAccessModal({
    isOpen,
    onClose,
    email,
    fileName,
    mimeType,
    externalId,
    firmId,
    documentUrl,
    mode,
    isLoading,
    error,
    onRequestNewLink,
}: SecureAccessModalProps) {
    const isFolder = mimeType?.includes('folder')
    const proxyThumbnailUrl = externalId && firmId
        ? `/api/proxy/thumbnail/${encodeURIComponent(externalId)}?firmId=${encodeURIComponent(firmId)}&size=400`
        : null
    // Falls back to the mimeType-based DocumentIcon when the thumbnail 404s/fails to load
    // (e.g. the proxy has no thumbnail for this file yet) — previously showed the browser's
    // broken-image icon instead.
    const [thumbnailFailed, setThumbnailFailed] = useState(false)

    const effectiveMode: SecureOpenModalMode = mode ?? (error ? 'error' : isLoading ? 'loading' : 'email')
    const isBusy = effectiveMode === 'loading' || effectiveMode === 'opening'
    const heading = HEADINGS[effectiveMode]

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (isBusy) return
                if (!open) onClose()
            }}
        >
            <DialogContent
                className="gap-0 p-0 sm:max-w-sm"
                hideClose={isBusy}
                onInteractOutside={(e) => { if (isBusy) e.preventDefault() }}
                onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault() }}
            >
                <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-5 pr-10">
                    <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control [&_svg]:h-4 [&_svg]:w-4 ${
                            effectiveMode === 'error' ? 'bg-tag-red-bg text-tag-red-fg' : 'bg-surface-muted text-fg-muted'
                        }`}
                    >
                        {effectiveMode === 'error' ? <AlertCircle />
                            : effectiveMode === 'loading' ? <LoadingSpinner size="sm" />
                            : effectiveMode === 'email' ? <Mail />
                            : <ExternalLink />}
                    </div>
                    {/* Polite live region: the state changes while the dialog is open (loading →
                        opening, email or error), and a new title alone isn't announced. */}
                    <div className="min-w-0 pt-0.5" aria-live="polite">
                        <DialogTitle className="text-ui font-semibold leading-tight text-fg">{heading.title}</DialogTitle>
                        <DialogDescription className="mt-0.5 break-words text-small text-fg-muted">
                            {heading.subtitle(email || 'your email')}
                        </DialogDescription>
                    </div>
                </div>

                <div className="space-y-3 px-5 py-4 pl-16">
                    {effectiveMode === 'error' ? (
                        <p className="text-small leading-relaxed text-fg">{error}</p>
                    ) : (
                        <>
                            {/* The file being opened */}
                            <div className="flex items-center gap-2.5 rounded-control border border-line bg-surface p-2">
                                {proxyThumbnailUrl && !thumbnailFailed ? (
                                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-control border border-line">
                                        <img
                                            src={proxyThumbnailUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            onError={() => setThumbnailFailed(true)}
                                        />
                                    </div>
                                ) : isFolder ? (
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                                        <DeliverableIcon hint className="h-7 w-7" />
                                    </div>
                                ) : (
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                                        <DocumentIcon mimeType={mimeType} size={24} />
                                    </div>
                                )}
                                {/* min-w-0 lets this shrink below its content so `truncate` engages.
                                    The dialog's own grid track is capped separately (see dialog.tsx)
                                    — without that cap this alone is not enough, because the ancestor
                                    grid item refuses to shrink and nothing here ever gets squeezed. */}
                                <p className="min-w-0 truncate text-small font-medium text-fg" title={fileName}>{fileName}</p>
                            </div>

                            {effectiveMode === 'blocked' && (
                                <p className="text-small leading-relaxed text-fg-muted">
                                    Your browser blocked the new tab. Open the document from here.
                                </p>
                            )}
                            {effectiveMode === 'email' && (
                                <p className="text-small leading-relaxed text-fg-muted">
                                    Your storage provider asks for a one-time check. Follow the link in the email to open the document.
                                </p>
                            )}
                            {effectiveMode === 'opened' && onRequestNewLink && (
                                <p className="text-small leading-relaxed text-fg-muted">
                                    Didn’t get in? We can email you a new access link.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {!isBusy && (
                    <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                        {effectiveMode === 'blocked' ? (
                            <>
                                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                                {documentUrl && (
                                    <Button
                                        size="sm"
                                        onClick={() => { window.open(documentUrl, '_blank'); onClose() }}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Open document
                                    </Button>
                                )}
                            </>
                        ) : effectiveMode === 'email' ? (
                            <Button size="sm" className="min-w-[5.5rem]" onClick={onClose}>Got it</Button>
                        ) : effectiveMode === 'opened' ? (
                            <>
                                {onRequestNewLink && (
                                    <Button variant="outline" size="sm" onClick={onRequestNewLink}>
                                        <Mail className="h-3.5 w-3.5" />
                                        Email me a new access link
                                    </Button>
                                )}
                                <Button size="sm" className="min-w-[5.5rem]" onClick={onClose}>Done</Button>
                            </>
                        ) : (
                            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
