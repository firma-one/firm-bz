"use client"

import { useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"
import { submitErrorTicket } from "@/app/actions/submit-ticket"
import { uploadSupportAttachment, type AttachmentMeta } from "@/lib/support-attachment-upload"
import { toSupportTicket, type SupportComment, type SupportTicket, type TicketKind, type TicketStatus } from "@/lib/support/ticket-view"
import { failureFrom, failureReason } from "@/lib/files/action-failure"
import { PLATFORM_SUPPORT_EMAIL } from "@/config/platform-emails"

/*
 * The Support page's requests (.claude/plans/app-design-refinements.md, section 14), in one store the
 * table and the right-pane sidebar both read, so a reply or a status change shows in both at once (the
 * pane's content is set once, and would otherwise hold a stale copy).
 *
 * Where it reads and writes is a SupportSource: the app's API, or the tour's demo data.
 */

export type NewRequest = {
    kind: TicketKind
    description: string
    /** Both set, or neither (firm-wide). */
    clientSlug?: string
    engagementSlug?: string
}

/** A file that wasn't attached, and why: the upload's own reason, or the save's. */
export type FileFailure = { name: string; reason: string }

/**
 * Where the Support page reads and writes. Every method throws an Error whose message is the
 * reason, in a person's words (the route's, or "Couldn't reach Firma…"); the panels put the action
 * in front of it ("Couldn't send your reply").
 */
export type SupportSource = {
    load: () => Promise<SupportTicket[]>
    /** Files a request and returns its number. */
    create: (input: NewRequest) => Promise<string>
    addComment: (ticketNumber: string, content: string) => Promise<SupportComment>
    setStatus: (ticketNumber: string, status: TicketStatus) => Promise<void>
    /** Uploads and attaches; returns what was attached, and each file that wasn't, with why. */
    addFiles: (ticketNumber: string, files: File[]) => Promise<{ attached: AttachmentMeta[]; failed: FileFailure[] }>
    removeFile: (ticketNumber: string, attachmentId: string) => Promise<void>
}

/** "Budget.xlsx (File too large (max 8MB))", for a toast. */
export function describeFileFailures(failed: FileFailure[]): string {
    return failed.map((f) => `${f.name} (${f.reason})`).join(", ")
}

async function bearer(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.")
    return session.access_token
}

/**
 * The app's API: /api/support/requests and its routes, and the submit-ticket action. A firm's requests,
 * or — `firmSlug` null — every firm's, for the Firma team (the API checks).
 */
export function liveSupportSource(firmSlug: string | null): SupportSource {
    return {
        load: async () => {
            const res = await fetch(firmSlug ? `/api/support/requests?firmSlug=${encodeURIComponent(firmSlug)}` : "/api/support/requests?all=1")
            if (!res.ok) throw await failureFrom(res)
            const rows = (await res.json()) as Record<string, unknown>[]
            return rows.map(toSupportTicket)
        },
        create: async (input) => {
            if (!firmSlug) throw new Error("Requests are raised from a firm’s Support page")
            const result = await submitErrorTicket({
                description: input.description,
                type: input.kind,
                firmSlug,
                clientSlug: input.clientSlug,
                projectSlug: input.engagementSlug,
                metadata: {
                    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
                    screen: typeof window !== "undefined" ? { width: window.screen.width, height: window.screen.height } : undefined,
                },
            })
            // The action's own message ("Failed to submit ticket") says nothing; nothing was filed.
            if (!result.success || !result.ticketNumber) {
                throw new Error(`It wasn't saved on our side. Try again, or email ${PLATFORM_SUPPORT_EMAIL}.`)
            }
            return result.ticketNumber
        },
        addComment: async (ticketNumber, content) => {
            const res = await fetch(`/api/support/requests/${encodeURIComponent(ticketNumber)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            })
            if (!res.ok) throw await failureFrom(res)
            const { comment } = await res.json()
            // The API says whether it counts as Firma's (a team member outside the request's firm).
            return toSupportTicket({ ticketNumber, description: "", createdAt: comment.createdAt, comments: [comment] }).comments[0]
        },
        setStatus: async (ticketNumber, status) => {
            const res = await fetch(`/api/support/requests/${encodeURIComponent(ticketNumber)}/status`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            })
            if (!res.ok) throw await failureFrom(res)
        },
        addFiles: async (ticketNumber, files) => {
            const token = await bearer()
            const results = await Promise.all(files.map((f) => uploadSupportAttachment(token, ticketNumber, f)))
            const attached = results.filter((r) => r.success && r.meta).map((r) => r.meta!)
            // Each file's own reason, not a count: "too large" is something the person can fix.
            const failed: FileFailure[] = results.flatMap((r, i) =>
                r.success && r.meta ? [] : [{ name: files[i].name, reason: r.error || "The upload didn't finish." }])
            if (attached.length > 0) {
                const res = await fetch(`/api/support/requests/${encodeURIComponent(ticketNumber)}/attachments`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ attachments: attached }),
                }).catch((e: unknown) => e)
                // Uploaded but not saved to the request: still a failure to the person, with why.
                if (!(res instanceof Response) || !res.ok) {
                    const reason = res instanceof Response ? (await failureFrom(res)).message : failureReason(res)
                    return { attached: [], failed: [...failed, ...attached.map((a) => ({ name: a.originalName, reason }))] }
                }
            }
            return { attached, failed }
        },
        removeFile: async (ticketNumber, attachmentId) => {
            const res = await fetch(`/api/support/requests/${encodeURIComponent(ticketNumber)}/attachments`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ attachmentId }),
            })
            if (!res.ok) throw await failureFrom(res)
        },
    }
}

export type SupportState = {
    tickets: SupportTicket[]
    loading: boolean
    error: string | null
    /** The title of a request being written in the sidebar, shown as a draft row; null when none. */
    draft: string | null
}

export class SupportStore {
    private state: SupportState = { tickets: [], loading: true, error: null, draft: null }
    private listeners = new Set<() => void>()

    constructor(private source: SupportSource) {}

    subscribe = (fn: () => void) => {
        this.listeners.add(fn)
        return () => { this.listeners.delete(fn) }
    }

    getSnapshot = () => this.state

    private set(next: Partial<SupportState>) {
        this.state = { ...this.state, ...next }
        this.listeners.forEach((fn) => fn())
    }

    private patch(ticketNumber: string, fn: (t: SupportTicket) => SupportTicket) {
        this.set({ tickets: this.state.tickets.map((t) => (t.ticketNumber === ticketNumber ? fn(t) : t)) })
    }

    find(ticketNumber: string): SupportTicket | undefined {
        return this.state.tickets.find((t) => t.ticketNumber === ticketNumber)
    }

    async load() {
        // A retry after a failed load shows the spinner, not the failure, while it runs.
        if (this.state.error) this.set({ loading: true, error: null })
        try {
            this.set({ tickets: await this.source.load(), loading: false, error: null })
        } catch (e) {
            // The reason, for "Couldn't load requests · …".
            this.set({ loading: false, error: failureReason(e) })
        }
    }

    setDraft(title: string | null) {
        if (title !== this.state.draft) this.set({ draft: title })
    }

    /**
     * Files it, attaches its files, and reloads so it appears in the table.
     *
     * Throws only when the request itself wasn't filed. Once it exists, nothing after that throws:
     * a failed attach comes back in `failedFiles`, so the person is told the request was sent
     * rather than "couldn't send", which a retry would turn into a duplicate.
     */
    async create(input: NewRequest, files: File[]): Promise<{ ticketNumber: string; failedFiles: FileFailure[] }> {
        const ticketNumber = await this.source.create(input)
        let failedFiles: FileFailure[] = []
        if (files.length) {
            try {
                failedFiles = (await this.source.addFiles(ticketNumber, files)).failed
            } catch (e) {
                const reason = failureReason(e)
                failedFiles = files.map((f) => ({ name: f.name, reason }))
            }
        }
        await this.load()
        return { ticketNumber, failedFiles }
    }

    /** Optimistic: the pill changes at once and goes back if the save fails. */
    async setStatus(ticketNumber: string, status: TicketStatus) {
        const before = this.find(ticketNumber)?.status
        this.patch(ticketNumber, (t) => ({ ...t, status, updatedAt: new Date().toISOString() }))
        try {
            await this.source.setStatus(ticketNumber, status)
        } catch (e) {
            if (before) this.patch(ticketNumber, (t) => ({ ...t, status: before }))
            throw e
        }
    }

    async addComment(ticketNumber: string, content: string) {
        const comment = await this.source.addComment(ticketNumber, content)
        this.patch(ticketNumber, (t) => ({ ...t, comments: [...t.comments, comment], updatedAt: comment.createdAt }))
    }

    /** Attaches what it can; returns each file that wasn't, with why. */
    async addFiles(ticketNumber: string, files: File[]): Promise<FileFailure[]> {
        const { attached, failed } = await this.source.addFiles(ticketNumber, files)
        if (attached.length) this.patch(ticketNumber, (t) => ({ ...t, attachments: [...t.attachments, ...attached] }))
        return failed
    }

    async removeFile(ticketNumber: string, attachmentId: string) {
        await this.source.removeFile(ticketNumber, attachmentId)
        this.patch(ticketNumber, (t) => ({ ...t, attachments: t.attachments.filter((a) => a.attachmentId !== attachmentId) }))
    }
}

export function useSupportState(store: SupportStore): SupportState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
