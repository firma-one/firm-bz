'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, FileText, Lock, Trash2 } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { StatusProperty } from '@/components/ui/property-cells'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import type { DemoEngagement } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { prettyName } from '@/lib/demo/demo-summary'
import { FindActionsButton, NotesProposalsReview, formatProposalDay, type NotesProposalsFound } from '@/components/projects/notes-proposals-panel'
import type { NotesProposal } from '@/lib/ai/notes-proposals'

const NOT_IN_DEMO = 'Not available in this demo'

/** A local calendar day as YYYY-MM-DD. */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Monday of the week `weeksAhead` from this one (0 = this week's Monday). */
function mondayOf(weeksAhead: number, now = new Date()): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dow = d.getDay()
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + weeksAhead * 7)
    return d
}

/**
 * Call notes and what Brio finds in them, for the tour: the app's own proposal rows over a canned
 * answer, dated from today and naming one of this engagement's deliverables. Nothing is called;
 * Apply only marks the row.
 */
function demoNotes(engagement: DemoEngagement): { notes: string; found: NotesProposalsFound } {
    const now = new Date()
    const nextMonday = isoDay(mondayOf(1, now))
    const mondayAfter = isoDay(mondayOf(2, now))
    const fridayAfterNext = (() => { const d = mondayOf(2, now); d.setDate(d.getDate() + 4); return isoDay(d) })()
    const target = getDemoDeliverables(engagement).find((d) => d.status !== 'approved' && d.dueDate && d.dueDate !== fridayAfterNext)
    const targetName = target ? prettyName(target.folder.name) : null

    const lines = {
        figures: "They'll send the latest figures by end of next week",
        due: targetName ? `Wants the ${targetName} by the Friday after next` : null,
        scope: 'Asked if we can also put together a board summary; new piece of work',
        chase: 'I need to chase the signed change order, still missing',
        later: 'Next check-in after the holidays',
    }
    const notes = [
        `Call with the client, ${formatProposalDay(isoDay(now))}`,
        '',
        ...[lines.figures, lines.due, lines.scope, lines.chase, lines.later].filter(Boolean).map((l) => `- ${l}`),
    ].join('\n')

    const proposals: NotesProposal[] = [
        { kind: 'reminder', id: 'reminder-1', title: 'Check the figures arrived', date: mondayAfter, quote: lines.figures },
        ...(target && lines.due ? [{
            kind: 'dueDate' as const, id: 'dueDate-2', deliverableId: target.folder.id, docId: target.folder.docId,
            deliverableName: targetName!, currentDate: target.dueDate, newDate: fridayAfterNext, quote: lines.due,
        }] : []),
        { kind: 'reminder', id: 'reminder-3', title: 'Chase the signed change order', date: nextMonday, quote: lines.chase },
        { kind: 'deliverable', id: 'deliverable-4', name: 'Board Summary', dueDate: null, quote: lines.scope },
    ]
    return { notes, found: { proposals, skipped: [{ quote: lines.later, reason: 'has no date' }], dropped: 0 } }
}

/** The memo with "Find actions in these notes", as in engagement-settings-form.tsx. */
function DemoMemo({ engagement }: { engagement: DemoEngagement }) {
    const canned = useMemo(() => demoNotes(engagement), [engagement])
    const [notes, setNotes] = useState(canned.notes)
    const [busy, setBusy] = useState(false)
    const [found, setFound] = useState<NotesProposalsFound | null>(null)
    const [round, setRound] = useState(0)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    const find = () => {
        setBusy(true)
        setFound(null)
        setRound((r) => r + 1)
        timer.current = setTimeout(() => { setBusy(false); setFound(canned.found) }, 900)
    }

    return (
        <div className="flex w-full flex-col gap-1">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Private notes, call summaries, context…" aria-label="Internal memo" rows={8} className={PROPERTY_TEXTAREA_CLASS} />
            <p className="px-2 text-caption text-fg-subtle">Internal only.</p>
            <div className="flex w-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 px-2">
                    <FindActionsButton busy={busy} disabled={!notes.trim()} onClick={find} />
                </div>
                {found && !busy && (
                    <NotesProposalsReview
                        key={round}
                        found={found}
                        apply={() => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 400))}
                        onDismiss={() => setFound(null)}
                    />
                )}
            </div>
        </div>
    )
}
const STATUS_OPTIONS: LwCrmEngagementStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']

const formatDay = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Empty'

/**
 * Static counterpart to engagement-settings-form.tsx (Engagement › Settings): the same Details,
 * Commercial and Tracking sections and the danger zone, over the sample engagement. Fields and the
 * status change on screen; Save and Delete are inert, as nothing here is saved.
 */
export function DemoEngagementSettings({ engagement, description, kickoff }: { engagement: DemoEngagement; description: string; kickoff: string | null }) {
    const [status, setStatus] = useState<LwCrmEngagementStatus>('ACTIVE')

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-6">
            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Details</h3>
                <PropertyList>
                    <PropertyRow label="Name" icon={<FileText />}><Input defaultValue={engagement.name} aria-label="Name" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                    <PropertyRow label="Status" icon={<Activity />}>
                        <StatusProperty kind="engagement" value={status} options={STATUS_OPTIONS} onChange={(v) => setStatus(v as LwCrmEngagementStatus)} />
                    </PropertyRow>
                    <PropertyRow label="Description" icon={<AlignLeft />}>
                        <div className="flex w-full flex-col gap-1">
                            <Textarea defaultValue={description} aria-label="Description" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                            <p className="px-2 text-caption text-fg-subtle"><Brio className="text-caption" /> uses this for context when answering questions about this engagement.</p>
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Commercial</h3>
                <PropertyList>
                    <PropertyRow label="Contract type" icon={<FileText />}><Input defaultValue={engagement.contractType ?? ''} placeholder="Empty" aria-label="Contract type" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                    <PropertyRow label="Contract value" icon={<Banknote />}><Input defaultValue={engagement.rateOrValue ?? ''} placeholder="Empty" aria-label="Contract value" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Tracking</h3>
                <PropertyList>
                    <PropertyRow label="Start date" icon={<CalendarClock />}><span className="px-2 text-ui text-fg">{formatDay(kickoff)}</span></PropertyRow>
                    <PropertyRow label="End date" icon={<CalendarCheck />}><span className="px-2 text-ui text-fg">{formatDay(engagement.dueDate ?? null)}</span></PropertyRow>
                    <PropertyRow label="Internal memo" icon={<Lock />}><DemoMemo engagement={engagement} /></PropertyRow>
                </PropertyList>
            </section>

            <div>
                <Hint label={NOT_IN_DEMO} side="top">
                    <span className="inline-flex"><Button type="button" variant="greenCta" disabled>Save changes</Button></span>
                </Hint>
            </div>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Danger zone</h3>
                <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <p className="text-ui font-medium text-fg">Delete engagement</p>
                        <p className="text-small text-fg-muted">Removes all members and revokes their Drive access. The folder stays in Google Drive for the firm admin.</p>
                    </div>
                    <Hint label={NOT_IN_DEMO} side="top">
                        <span className="inline-flex shrink-0">
                            <Button type="button" variant="outline" disabled className="text-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" />Delete engagement</Button>
                        </span>
                    </Hint>
                </div>
            </section>
        </div>
    )
}
