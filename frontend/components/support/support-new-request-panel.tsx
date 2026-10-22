"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Briefcase, FileText, Image as ImageIcon, Loader2, X } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { TICKET_KIND_LABEL, splitDescription, type TicketKind } from "@/lib/support/ticket-view"
import { KindIcon, formatBytes } from "./support-bits"
import { SupportDropZone } from "./support-drop-zone"
import type { SupportStore } from "./support-store"

/*
 * New request, in the right pane beside the list (.claude/plans/app-design-refinements.md, section 14):
 * the table stays in view with a draft row where it will land, and sending turns this pane into the
 * request itself. Kind, where, what happened (its first line is the title), and files.
 */

export type SupportEngagementOption = {
    clientSlug: string
    clientName: string
    engagementSlug: string
    engagementName: string
}

const KINDS: TicketKind[] = ["BUG", "REQUEST", "ENQUIRY"]
const FIRM_WIDE = "__firm__"

export function SupportNewRequestPanel({
    store,
    firmName,
    engagements,
    onSent,
    onCancel,
    onDirtyChange,
}: {
    store: SupportStore
    firmName: string
    engagements: SupportEngagementOption[]
    onSent: (ticketNumber: string) => void
    onCancel: () => void
    /** Something typed or attached, so closing should ask first. */
    onDirtyChange: (dirty: boolean) => void
}) {
    const { addToast } = useToast()
    const [kind, setKind] = useState<TicketKind>("BUG")
    const [where, setWhere] = useState(FIRM_WIDE)
    const [text, setText] = useState("")
    const [files, setFiles] = useState<File[]>([])
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // The shell renders the pane twice (docked, and as a sheet on small screens), so ids are generated.
    const whereId = useId()
    const whatId = useId()
    const dirty = text.trim() !== "" || files.length > 0
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
    // The draft row in the table follows the first line as it's typed.
    useEffect(() => {
        store.setDraft(text.trim() ? splitDescription(text).title : "New request")
    }, [store, text])
    useEffect(() => () => store.setDraft(null), [store])

    const byClient = useMemo(() => {
        const map = new Map<string, SupportEngagementOption[]>()
        for (const e of engagements) map.set(e.clientName, [...(map.get(e.clientName) ?? []), e])
        return Array.from(map.entries())
    }, [engagements])

    const send = async () => {
        if (!text.trim() || sending) return
        setSending(true)
        setError(null)
        try {
            const picked = engagements.find((e) => `${e.clientSlug}/${e.engagementSlug}` === where)
            const { ticketNumber, failedFiles } = await store.create(
                { kind, description: text.trim(), clientSlug: picked?.clientSlug, engagementSlug: picked?.engagementSlug },
                files
            )
            if (failedFiles) addToast({ type: "error", title: `Sent, but ${failedFiles} file${failedFiles === 1 ? "" : "s"} couldn’t be attached` })
            else addToast({ type: "success", title: `Request ${ticketNumber} sent` })
            onDirtyChange(false)
            onSent(ticketNumber)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t send the request")
            setSending(false)
        }
    }

    return (
        <form
            className="flex h-full min-h-0 flex-col"
            onSubmit={(e) => {
                e.preventDefault()
                void send()
            }}
        >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-5">
                <fieldset>
                    <legend className="mb-2 text-small font-medium text-fg-muted">What kind of request?</legend>
                    <div className="grid grid-cols-3 gap-0.5 rounded-card bg-surface-muted p-0.5" role="radiogroup">
                        {KINDS.map((k) => (
                            <label
                                key={k}
                                className={cn(
                                    "flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control text-small transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-action/30",
                                    kind === k ? "bg-surface font-medium text-fg shadow-[0_1px_2px_rgba(15,15,15,0.08),0_0_0_1px_rgba(15,15,15,0.04)]" : "text-fg-muted hover:text-fg"
                                )}
                            >
                                <input type="radio" name={`${whatId}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                                <KindIcon kind={k} />
                                {TICKET_KIND_LABEL[k]}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <label htmlFor={whereId} className="mb-2 mt-5 block text-small font-medium text-fg-muted">Where</label>
                <Select value={where} onValueChange={setWhere}>
                    <SelectTrigger id={whereId} className="h-9 gap-2">
                        <Briefcase aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        {/* A direct span child is clamped to one line by the trigger, so the value stays beside the icon */}
                        <span className="min-w-0 flex-1 text-left text-ui"><SelectValue /></span>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={FIRM_WIDE}>Firm-wide · {firmName}</SelectItem>
                        {byClient.map(([client, list]) => (
                            <SelectGroup key={client}>
                                <SelectLabel>{client}</SelectLabel>
                                {list.map((e) => (
                                    <SelectItem key={`${e.clientSlug}/${e.engagementSlug}`} value={`${e.clientSlug}/${e.engagementSlug}`}>
                                        {e.clientName} › {e.engagementName}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
                <p className="mt-1.5 text-caption font-normal text-fg-subtle">Pick the engagement it’s about, or leave it firm-wide.</p>

                <label htmlFor={whatId} className="mb-2 mt-5 block text-small font-medium text-fg-muted">What happened?</label>
                <textarea
                    id={whatId}
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void send()
                        }
                    }}
                    rows={7}
                    placeholder={
                        kind === "BUG"
                            ? "A one-line summary first, then what you did, what you expected and what happened."
                            : kind === "REQUEST"
                                ? "A one-line summary first, then what you'd like and why it would help."
                                : "Your question in one line, then any detail that helps us answer."
                    }
                    className="block w-full resize-none rounded-control border border-line-strong bg-surface px-3 py-2 text-ui leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-action/50 focus:ring-2 focus:ring-action/15"
                />
                <p className="mt-1.5 text-caption font-normal text-fg-subtle">The first line becomes the title.</p>

                <p className="mb-2 mt-5 text-small font-medium text-fg-muted">Screenshots and files</p>
                <SupportDropZone onFiles={(added) => setFiles((prev) => [...prev, ...added])} disabled={sending} />
                {files.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {files.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-surface-muted pl-2 pr-0.5 text-small text-fg">
                                {f.type.startsWith("image/") ? <ImageIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" /> : <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-muted" />}
                                <span className="truncate">{f.name}</span>
                                <span className="shrink-0 text-caption font-normal text-fg-subtle">{formatBytes(f.size)}</span>
                                <button
                                    type="button"
                                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                    aria-label={`Remove ${f.name}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {error && <p className="mt-3 text-small text-danger">{error}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-3">
                <Hint label="Your browser and screen size go with the request, to help us reproduce it.">
                    <p className="flex-1 cursor-default truncate text-caption font-normal text-fg-subtle">Includes your browser details</p>
                </Hint>
                <button type="button" onClick={onCancel} className="h-8 rounded-control px-3 text-small font-medium text-fg hover:bg-surface-hover">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-small font-medium text-white transition-[filter] hover:brightness-105 disabled:opacity-50"
                >
                    {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send request
                </button>
            </div>
        </form>
    )
}
