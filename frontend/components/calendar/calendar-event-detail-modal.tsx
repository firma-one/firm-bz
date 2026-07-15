'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Building2, Briefcase, Layers, FileText, ArrowUpRight, ListTodo, PenLine, Eye, CheckCircle, CalendarDays, User,
} from 'lucide-react'
import { UserAvatarWithTooltip } from '@/components/ui/user-avatar-with-tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { formatFullDate, cn } from '@/lib/utils'
import { getEngagementColor } from '@/lib/calendar/engagement-color'
import { useAuth } from '@/lib/auth-context'
import type { CalendarEvent } from '@/lib/actions/calendar'
import type { ActivityStatus } from '@/lib/sharing-settings'

const STAGE_LABELS: Record<ActivityStatus, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
}

const STAGE_ICON: Record<ActivityStatus, React.ReactNode> = {
  to_do: <ListTodo className="h-3 w-3" />,
  in_progress: <PenLine className="h-3 w-3" />,
  in_review: <Eye className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
}

const STAGE_COLOR: Record<ActivityStatus, string> = {
  to_do: 'bg-[#f3b52f] text-white',
  in_progress: 'bg-[#3b5bfd] text-white',
  in_review: 'bg-[#7c3aed] text-white',
  // Fixed Firma green — not bg-primary, which is theme-able per firm brand color.
  approved: 'bg-[#069668] text-white',
}

const STATUS_BADGE_WIDTH = 'w-[92px]'

function StatusBadge({ status }: { status: ActivityStatus | null }) {
  if (!status) return <span className={cn('inline-block shrink-0', STATUS_BADGE_WIDTH)} />
  return (
    <span className={cn('inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0', STATUS_BADGE_WIDTH, STAGE_COLOR[status])}>
      {STAGE_ICON[status]}
      {STAGE_LABELS[status]}
    </span>
  )
}

const ENGAGEMENT_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  PAUSED: 'Paused',
}

const ENGAGEMENT_STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-blue-500 text-white',
  ACTIVE: 'bg-primary text-white',
  COMPLETED: 'bg-[#8a8d94] text-white',
  PAUSED: 'bg-fuchsia-500 text-white',
}

function EngagementStatusBadge({ status }: { status: string }) {
  const color = ENGAGEMENT_STATUS_COLOR[status] ?? ENGAGEMENT_STATUS_COLOR.ACTIVE
  const label = ENGAGEMENT_STATUS_LABEL[status] ?? 'Active'
  return (
    <span className={cn('inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0', STATUS_BADGE_WIDTH, color)}>
      {label}
    </span>
  )
}

function DueDate({ date }: { date: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1 text-xs whitespace-nowrap shrink-0', date ? 'text-[#45474c]' : 'italic text-[#c1c4cb]')}>
          <CalendarDays className="h-3 w-3" />
          {date ? formatFullDate(date) : 'Not Set'}
        </span>
      </TooltipTrigger>
      <TooltipContent variant="light" side="top">Due Date</TooltipContent>
    </Tooltip>
  )
}

function Assignee({ name, email, avatarUrl }: { name: string | null; email: string | null; avatarUrl: string | null }) {
  const hasAssignee = !!(name || email)
  if (!hasAssignee) {
    return (
      <span className="inline-flex items-center gap-1 text-xs shrink-0">
        <User className="h-3 w-3 shrink-0 text-[#c1c4cb]" />
        <span className="italic text-[#c1c4cb]">Unassigned</span>
      </span>
    )
  }
  return (
    <UserAvatarWithTooltip
      displayName={name ?? email ?? ''}
      email={email ?? undefined}
      photoLink={avatarUrl ?? undefined}
      avatarSize="sm"
      showRole={false}
    />
  )
}

type SiblingDocument = {
  documentId: string
  fileName: string
  docId: string | null
  dueDate: string | null
  status: ActivityStatus | null
  assigneeName: string | null
  assigneeEmail: string | null
  assigneeAvatarUrl: string | null
}

type DeliverableDetail = {
  documentId: string
  fileName: string
  docId: string | null
  dueDate: string | null
  status: ActivityStatus | null
}

function DocId({ docId }: { docId: string | null }) {
  if (!docId) return null
  return <span className="text-[11px] font-bold font-mono tracking-wide text-primary shrink-0">{docId}</span>
}

function DocumentRowSkeleton() {
  return (
    <div className="flex items-center gap-2 py-1.5 px-1.5 -mx-1.5">
      <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Skeleton className="h-3 w-10 shrink-0" />
        <Skeleton className="h-3 flex-1 max-w-[160px]" />
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-[92px] rounded" />
        <Skeleton className="h-5 w-5 rounded" />
      </div>
    </div>
  )
}

interface CalendarEventDetailModalProps {
  event: CalendarEvent | null
  onClose: () => void
}

function NavArrow({ href, label }: { href: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-[#8a8d94] hover:text-primary hover:bg-primary/10 shrink-0 transition-colors"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent variant="light" side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function CalendarEventDetailModal({ event, onClose }: CalendarEventDetailModalProps) {
  const { session } = useAuth()
  const [siblings, setSiblings] = useState<SiblingDocument[] | null>(null)
  const [deliverableDetail, setDeliverableDetail] = useState<DeliverableDetail | null>(null)
  const [isLoadingSiblings, setIsLoadingSiblings] = useState(false)

  // The deliverable folder's document id, whether this event IS the
  // deliverable or is a document nested inside one.
  const deliverableDocId = event?.type === 'deliverable' ? event.documentId : event?.deliverableId ?? null

  useEffect(() => {
    setSiblings(null)
    setDeliverableDetail(null)
    if (!deliverableDocId || !event || !session?.access_token) return
    let cancelled = false
    setIsLoadingSiblings(true)
    fetch(`/api/projects/${event.engagementId}/documents/${deliverableDocId}/subtasks`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : { subtasks: [], deliverable: null }))
      .then((data) => {
        if (cancelled) return
        setSiblings((data.subtasks ?? []).map((s: any) => ({
          documentId: s.documentId,
          fileName: s.fileName,
          docId: s.docId,
          dueDate: s.dueDate,
          status: s.status,
          assigneeName: s.assigneeName,
          assigneeEmail: s.assigneeEmail,
          assigneeAvatarUrl: s.assigneeAvatarUrl,
        })))
        setDeliverableDetail(data.deliverable ?? null)
      })
      .catch(() => { if (!cancelled) { setSiblings([]); setDeliverableDetail(null) } })
      .finally(() => { if (!cancelled) setIsLoadingSiblings(false) })
    return () => { cancelled = true }
  }, [deliverableDocId, event?.engagementId, session?.access_token])

  if (!event) return null
  const color = getEngagementColor(event.engagementId)
  const hasDeliverable = event.type === 'deliverable' || event.type === 'document'
  const isEngagementLevelEvent = event.type === 'kickoff' || event.type === 'due' || event.type === 'followUp'

  // Prefer the freshly-fetched deliverable detail (correct in all cases); fall
  // back to the clicked event's own fields only while that fetch is in flight
  // and the event itself IS the deliverable, so the header doesn't flash empty.
  const deliverableName = deliverableDetail?.fileName ?? (event.type === 'deliverable' ? event.documentName : null)
  const deliverableStatus = deliverableDetail?.status ?? (event.type === 'deliverable' ? event.status : null)
  const deliverableDueDate = deliverableDetail?.dueDate ?? (event.type === 'deliverable' ? event.date : null)
  const deliverableDocIdLabel = deliverableDetail?.docId ?? (event.type === 'deliverable' ? event.docId : null)

  // event.ctaUrl for document/deliverable events is always
  // `${engagementUrl}/board#doc-file:${someDocId}`; for engagement-level
  // events it's just `${engagementUrl}`. Derive both consistently so the
  // Engagement row always has a working nav link regardless of event type.
  const boardBaseUrl = event.ctaUrl?.split('#')[0] ?? null
  const engagementUrl = isEngagementLevelEvent ? event.ctaUrl : boardBaseUrl?.replace(/\/board$/, '') ?? null
  const deliverableCtaUrl = deliverableDocId && boardBaseUrl ? `${boardBaseUrl}#doc-file:${deliverableDocId}` : null

  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl">
        <TooltipProvider delayDuration={300}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', color.dot)} />
            <DialogTitle className="text-base">Event Details</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-0 py-1 text-sm">
          {/* Client */}
          <div className="py-1.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#45474c] shrink-0" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Client</span>
            </div>
            <span className="text-xs font-medium text-[#45474c] truncate block mt-1 pl-6">{event.clientName}</span>
          </div>

          {/* Engagement */}
          <div className="pl-4 border-l-2 border-[#e5e7eb] ml-2 mt-12">
            <div
              className={cn(
                'py-1.5 rounded px-1.5 -mx-1.5',
                isEngagementLevelEvent && 'bg-primary/5 ring-1 ring-primary/20',
              )}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#45474c] shrink-0" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Engagement</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pl-6">
                <span className="text-xs font-medium text-[#45474c] truncate flex-1 min-w-0">{event.engagementName}</span>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <DueDate date={event.engagementDueDate} />
                  <EngagementStatusBadge status={event.engagementStatus} />
                  {engagementUrl && <NavArrow label="Open engagement" href={engagementUrl} />}
                </div>
              </div>
            </div>

            {/* Deliverable */}
            {hasDeliverable && (
              <div className="pl-4 border-l-2 border-[#e5e7eb] ml-2 mt-3">
                <div
                  className={cn(
                    'py-1.5 rounded px-1.5 -mx-1.5',
                    event.type === 'deliverable' && 'bg-primary/5 ring-1 ring-primary/20',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#45474c] shrink-0" />
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Deliverable</span>
                  </div>
                  {isLoadingSiblings && !deliverableName ? (
                    <div className="flex items-center gap-2 mt-1 pl-6">
                      <Skeleton className="h-3 w-10 shrink-0" />
                      <Skeleton className="h-3 w-32" />
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-5 w-[92px] rounded" />
                        <Skeleton className="h-5 w-5 rounded" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 pl-6 animate-in fade-in duration-200">
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        <DocId docId={deliverableDocIdLabel} />
                        <span className="text-xs font-medium text-[#45474c] truncate">{deliverableName ?? '—'}</span>
                      </span>
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <DueDate date={deliverableDueDate} />
                        <StatusBadge status={deliverableStatus} />
                        {deliverableCtaUrl && (
                          <NavArrow label="Open deliverable" href={deliverableCtaUrl} />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Documents under this deliverable */}
                <div className="pl-4 border-l-2 border-[#e5e7eb] ml-2 mt-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] py-1.5">Documents</p>
                  {isLoadingSiblings && (
                    <div className="space-y-1">
                      <DocumentRowSkeleton />
                      <DocumentRowSkeleton />
                      <DocumentRowSkeleton />
                    </div>
                  )}
                  {!isLoadingSiblings && siblings && siblings.length === 0 && (
                    <p className="text-xs text-[#8a8d94] italic py-1">No documents in this deliverable.</p>
                  )}
                  {!isLoadingSiblings && siblings && siblings.length > 0 && (
                    <div className="space-y-1 animate-in fade-in duration-200">
                      {siblings.map((doc) => {
                        const isClicked = event.type === 'document' && event.documentId === doc.documentId
                        return (
                          <div
                            key={doc.documentId}
                            className={cn(
                              'flex items-center gap-2 py-1.5 rounded px-1.5 -mx-1.5',
                              isClicked && 'bg-primary/5 ring-1 ring-primary/20',
                            )}
                          >
                            <FileText className="h-3.5 w-3.5 text-[#45474c] shrink-0" />
                            <span className="flex items-center gap-2 flex-1 min-w-0">
                              <DocId docId={doc.docId} />
                              <span className={cn('text-xs truncate', isClicked ? 'font-semibold text-[#1b1b1d]' : 'font-medium text-[#45474c]')}>
                                {doc.fileName}
                              </span>
                            </span>
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              <Assignee name={doc.assigneeName} email={doc.assigneeEmail} avatarUrl={doc.assigneeAvatarUrl} />
                              <DueDate date={doc.dueDate} />
                              <StatusBadge status={doc.status} />
                              {boardBaseUrl && (
                                <NavArrow
                                  label="Open document"
                                  href={`${boardBaseUrl}#doc-file:${doc.documentId}`}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
