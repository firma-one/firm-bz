"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { CircleDot, FileText, Image as ImageIcon, Loader2, Monitor, Paperclip, Plus, Send, Tag as TagIcon, Briefcase, UserRound, X } from "lucide-react"
import { StatusProperty } from "@/components/ui/property-cells"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { TICKET_STATUSES, wherePath, type SupportSide, type SupportTicket } from "@/lib/support/ticket-view"
import type { AttachmentMeta } from "@/lib/support-attachment-upload"
import { KindTag, SupportAvatar, formatBytes } from "./support-bits"
import { SupportDropZone } from "./support-drop-zone"
import { useSupportState, type SupportStore } from "./support-store"

/*
 * One request in the right pane (.claude/plans/app-design-refinements.md, section 14): its properties,
 * what was written, its files, and the conversation with Firma, with a reply box held at the bottom.
 * The details and the comments used to be two panes; this is one.
 */

function Property({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <>
            <span className="flex h-8 items-center gap-2 text-small text-fg-muted [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-fg-subtle">{icon}{label}</span>
            <span className="flex min-h-8 min-w-0 items-center gap-1.5 text-ui text-fg">{children}</span>
        </>
    )
}

function download(a: AttachmentMeta) {
    // The file is already here, as a data URL on the request (support attachments are DB blobs).
    const link = window.document.createElement("a")
    link.href = a.blobData
    link.download = a.originalName
    window.document.body.appendChild(link)
    link.click()
    window.document.body.removeChild(link)
}

export function SupportRequestPanel({
    store,
    ticketNumber,
    myEmail,
    engagementHref,
    side = "firm",
}: {
    store: SupportStore
    ticketNumber: string
    myEmail: string | null
    /** Where a request's engagement opens; none, and Where is plain text. */
    engagementHref?: (clientSlug: string, engagementSlug: string) => string | null
    /** "firma": the Firma team answering, so the reply goes to whoever raised it. */
    side?: SupportSide
}) {
    const { tickets } = useSupportState(store)
    const ticket = tickets.find((t) => t.ticketNumber === ticketNumber)
    const { addToast } = useToast()
    const [reply, setReply] = useState("")
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [showDrop, setShowDrop] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    // The shell renders the pane twice (docked, and as a sheet on small screens), so ids are generated.
    const replyId = useId()
    const commentCount = ticket?.comments.length ?? 0

    // A new message scrolls into view, as in any conversation.
    useEffect(() => {
        if (commentCount) endRef.current?.scrollIntoView({ block: "nearest" })
    }, [commentCount])

    if (!ticket) {
        return <p className="p-6 text-small text-fg-muted">This request is no longer here.</p>
    }

    const where = side === "firma" && ticket.firm && (ticket.client || ticket.engagement) ? [ticket.firm.name, ...wherePath(ticket)] : wherePath(ticket)
    const requester = ticket.raisedBy?.name.split(/\s+/)[0] ?? null
    const replyTo = side === "firma" ? (requester ? `Reply to ${requester}…` : "Reply…") : "Reply to Firma…"
    const replyHint = side === "firma" ? "They get your reply by email and in their Inbox" : "Firma replies here and by email"
    const whereHref = ticket.client && ticket.engagement ? engagementHref?.(ticket.client.slug, ticket.engagement.slug) ?? null : null

    const send = async () => {
        const text = reply.trim()
        if (!text || sending) return
        setSending(true)
        try {
            await store.addComment(ticket.ticketNumber, text)
            setReply("")
        } catch (e) {
            addToast({ type: "error", title: e instanceof Error ? e.message : "Couldn’t send your reply" })
        } finally {
            setSending(false)
        }
    }

    const attach = async (files: File[]) => {
        setUploading(true)
        try {
            const failed = await store.addFiles(ticket.ticketNumber, files)
            if (failed) addToast({ type: "error", title: `${failed} file${failed === 1 ? "" : "s"} couldn’t be attached` })
            else setShowDrop(false)
        } catch (e) {
            addToast({ type: "error", title: e instanceof Error ? e.message : "Couldn’t attach the files" })
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-5">
                <h2 className="text-h2 text-fg">{ticket.title}</h2>

                <div className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-x-2">
                    <Property icon={<CircleDot />} label="Status">
                        <StatusProperty
                            kind="ticket"
                            value={ticket.status}
                            options={TICKET_STATUSES}
                            onChange={(next) =>
                                store.setStatus(ticket.ticketNumber, next as SupportTicket["status"]).catch((e) =>
                                    addToast({ type: "error", title: e instanceof Error ? e.message : "Couldn’t change the status" })
                                )
                            }
                        />
                    </Property>
                    <Property icon={<TagIcon />} label="Type">
                        <KindTag kind={ticket.kind} />
                    </Property>
                    <Property icon={<Briefcase />} label="Where">
                        {whereHref ? (
                            <Link href={whereHref} className="truncate hover:underline">{where.join(" › ")}</Link>
                        ) : (
                            <span className="truncate">{where.join(" › ")}</span>
                        )}
                    </Property>
                    <Property icon={<UserRound />} label="Raised by">
                        <SupportAvatar name={ticket.raisedBy?.name} auto={ticket.auto} />
                        <span className="truncate">{ticket.auto ? "Automatic" : ticket.raisedBy?.name ?? "Unknown"}</span>
                        <span className="shrink-0 text-small text-fg-subtle">· {format(new Date(ticket.createdAt), "MMM d, h:mm a")}</span>
                    </Property>
                    {ticket.browser && (
                        <Property icon={<Monitor />} label="Browser">
                            <span className="text-small text-fg-muted">{ticket.browser}</span>
                        </Property>
                    )}
                </div>

                <div className="my-4 h-px bg-line" />

                {ticket.body ? (
                    <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">{ticket.body}</p>
                ) : !ticket.failure ? (
                    <p className="text-small text-fg-subtle">No more detail than the title.</p>
                ) : null}

                {/* An automatic request says what failed, which is all it has to go on. */}
                {ticket.failure && (
                    <div className="mt-3 rounded-card bg-surface-subtle px-3 py-2.5">
                        <p className="text-caption text-fg-muted">What failed</p>
                        {ticket.failure.action && <p className="mt-1 font-mono text-small text-fg">{ticket.failure.action}</p>}
                        {ticket.failure.message && <p className="mt-0.5 break-words font-mono text-small text-fg-muted">{ticket.failure.message}</p>}
                    </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {ticket.attachments.map((a) => (
                        <span key={a.attachmentId} className="group/file inline-flex h-7 max-w-full items-center rounded-control border border-line bg-surface text-small text-fg">
                            <button type="button" onClick={() => download(a)} className="flex min-w-0 items-center gap-1.5 rounded-control pl-2 pr-1.5 hover:bg-surface-hover" aria-label={`Download ${a.originalName}`}>
                                {a.mimeType.startsWith("image/") ? <ImageIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" /> : <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" />}
                                <span className="truncate">{a.originalName}</span>
                                <span className="shrink-0 text-caption font-normal text-fg-subtle">{formatBytes(a.size)}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => store.removeFile(ticket.ticketNumber, a.attachmentId).catch(() => addToast({ type: "error", title: "Couldn’t remove the file" }))}
                                aria-label={`Remove ${a.originalName}`}
                                className="mr-0.5 flex h-5 w-5 items-center justify-center rounded-control text-fg-subtle opacity-0 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover/file:opacity-100"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={() => setShowDrop((v) => !v)}
                        aria-expanded={showDrop}
                        className="inline-flex h-7 items-center gap-1.5 rounded-control border border-dashed border-line-strong px-2 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add files
                    </button>
                </div>
                {showDrop && <SupportDropZone compact onFiles={(files) => void attach(files)} disabled={uploading} className="mt-2" />}

                <div className="my-4 h-px bg-line" />

                <p className="mb-3 flex items-center gap-1.5 text-small font-semibold text-fg">
                    Conversation <span className="font-normal text-fg-subtle">{ticket.comments.length}</span>
                </p>
                {ticket.comments.length === 0 ? (
                    <p className="text-small text-fg-muted">{side === "firma" ? "No replies yet." : "No replies yet. Firma answers here and by email."}</p>
                ) : (
                    <ol className="flex flex-col gap-4">
                        {ticket.comments.map((c) => {
                            const mine = !!myEmail && c.authorEmail.toLowerCase() === myEmail.toLowerCase()
                            const name = c.fromFirma ? "Firma Support" : c.authorName ?? c.authorEmail.split("@")[0]
                            return (
                                <li key={c.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
                                    <SupportAvatar name={name} firma={c.fromFirma} size={24} />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 text-small">
                                            <span className="font-medium text-fg">{mine ? "You" : name}</span>
                                            {c.fromFirma && <span className="rounded-control bg-status-done-bg px-1 text-caption font-semibold text-primary">Firma</span>}
                                            <RelativeDateTime date={c.createdAt} textClassName="text-small text-fg-subtle" iconClassName="hidden" />
                                        </div>
                                        <p className="mt-0.5 whitespace-pre-wrap break-words text-ui leading-relaxed text-fg">{c.content}</p>
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                )}
                <div ref={endRef} />
            </div>

            {/* The reply box stays at the bottom while the conversation scrolls. */}
            <form
                className="mx-4 mb-4 shrink-0 rounded-card border border-line-strong bg-surface shadow-[0_1px_2px_rgba(15,15,15,0.04)] focus-within:border-action/50 focus-within:ring-2 focus-within:ring-action/15"
                onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                }}
            >
                <label htmlFor={replyId} className="sr-only">{replyTo.replace("…", "")}</label>
                <textarea
                    id={replyId}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void send()
                        }
                    }}
                    rows={2}
                    placeholder={replyTo}
                    className="block w-full resize-none rounded-card bg-transparent px-3 pt-2.5 text-ui text-fg outline-none placeholder:text-fg-subtle"
                />
                <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
                    <button
                        type="button"
                        onClick={() => setShowDrop(true)}
                        aria-label="Attach files"
                        className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
                    >
                        <Paperclip className="h-4 w-4" />
                    </button>
                    <span className="flex-1 truncate text-caption font-normal text-fg-subtle">{replyHint} · ⌘↵ to send</span>
                    <button
                        type="submit"
                        disabled={!reply.trim() || sending}
                        className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-small font-medium transition-colors",
                            reply.trim() ? "bg-primary text-white hover:brightness-105" : "bg-surface-muted text-fg-subtle"
                        )}
                    >
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
                    </button>
                </div>
            </form>
        </div>
    )
}
