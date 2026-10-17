'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CornerDownRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A page action offered in the Brio panel's suggestion lists — "Review folder organization", "Set up
 * folder organization" on Files — laid out like the "Ask next" rows around it: the same muted
 * corner-down-right icon in the same slot, so the icons line up. Only the label wears the accent
 * green, as a chip, since the action does something rather than asks something. No sparkle:
 * everything in this panel is AI.
 */
export const ChatActionRow = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
    busy?: boolean
    children: ReactNode
}>(function ChatActionRow({ busy = false, className, children, ...props }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            className={cn(
                'group/action inline-flex max-w-full items-start gap-2 rounded-control px-2 py-1 text-left text-small font-medium disabled:opacity-60',
                className,
            )}
            {...props}
        >
            <span className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                {busy ? <Loader2 className="animate-spin" /> : <CornerDownRight />}
            </span>
            <span className="min-w-0 rounded-control bg-action px-2 py-0.5 leading-5 text-action-fg transition-colors group-hover/action:bg-action-hover group-disabled/action:bg-action">
                {children}
            </span>
        </button>
    )
})

/**
 * A TASK the Brio panel can start, as opposed to a question it can answer
 * (.claude/plans/brio-panel-redesign.md, "Questions and tasks").
 *
 * A question is a string: clicking it asks the read-only chat and an answer streams back. A task
 * asks the user a few things and then changes something — on Files, reorganizing or setting up
 * folders — so the panel shows it under its own "Task" heading, with a line saying what will
 * happen, instead of mixing it into the questions. The page that owns the work supplies these as
 * data; the panel draws every one the same way.
 */
export interface ChatAction {
    id: string
    /** What it does, as a command: "Review folder organization". */
    label: string
    /** Shown while it runs, in place of the label: "Reviewing…". */
    busyLabel?: string
    /** One line on what will happen, shown under the label. Plain, specific, and honest about changes. */
    description: string
    busy?: boolean
    disabled?: boolean
    /** Shown under the description when the last run failed. */
    error?: string | null
    run: () => void
}

/** The panel's "Task" section: each task as a green row with its one-line description. */
export function ChatTaskList({ actions, heading = true }: { actions: ChatAction[]; heading?: boolean }) {
    if (actions.length === 0) return null
    return (
        <div className="flex flex-col gap-1">
            {heading && <p className="px-2 pb-0.5 text-caption text-fg-subtle">{actions.length === 1 ? 'Task' : 'Tasks'}</p>}
            {actions.map((a) => (
                <div key={a.id} className="flex flex-col items-start">
                    <ChatActionRow onClick={a.run} disabled={a.disabled || a.busy} busy={a.busy}>
                        {a.busy ? (a.busyLabel ?? a.label) : a.label}
                    </ChatActionRow>
                    {/* Aligned under the chip: the row's padding, icon slot and gap (8 + 16 + 8). */}
                    <p className="pl-8 pr-2 text-caption leading-snug text-fg-subtle">{a.description}</p>
                    {a.error && <p className="pl-8 pr-2 pt-0.5 text-caption text-danger">{a.error}</p>}
                </div>
            ))}
        </div>
    )
}

/**
 * The header a running or finished task carries in the thread — "Task · Review folder organization
 * · 2 of 5 answered" — so the record reads as a task, not as questions and answers, and shows how
 * far along it is.
 */
export function ChatTaskHeader({ title, status }: { title: string; status?: ReactNode }) {
    return (
        <div className="flex items-center gap-2 border-b border-line pb-1.5">
            <span className="shrink-0 rounded-control bg-action/10 px-1.5 py-px text-caption font-medium text-action">Task</span>
            <span className="min-w-0 flex-1 truncate text-small font-medium text-fg">{title}</span>
            {status && <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{status}</span>}
        </div>
    )
}
