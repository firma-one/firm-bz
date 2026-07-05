'use client'

import React from 'react'
import { Info, ListTodo, PenLine, Eye, CheckCircle, MessagesSquare, ArrowRight, Briefcase, FileUp, Share2, UserPlus, MessageSquare, FolderLock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import sandboxHierarchyJson from '@/lib/services/sandbox-hierarchy.json'
import type { SandboxEngagement } from './sandbox-file-preview'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'

const STATUS_CYCLE: ActivityStatus[] = ['approved', 'in_review', 'in_progress', 'to_do']

function findEngagement(projectName?: string): SandboxEngagement | undefined {
  const clients = (sandboxHierarchyJson as any).clients as { clientName: string; engagements: SandboxEngagement[] }[]
  for (const client of clients) {
    const eng = client.engagements.find(e =>
      projectName
        ? e.name.toLowerCase().includes(projectName.toLowerCase()) ||
          projectName.toLowerCase().includes(e.name.toLowerCase())
        : false
    ) ?? client.engagements[0]
    if (eng) return eng
  }
}

/** Returns the General subfolders for the matched engagement. Falls back to General files if no subfolders. */
function getDeliverables(projectName?: string): { name: string; fileCount: number }[] {
  const eng = findEngagement(projectName)
  if (!eng) return []
  const general = eng.structure['General']
  if (!general) return []
  const subs = general.subfolders ?? []
  if (subs.length > 0) {
    return subs.map(s => ({ name: s.name, fileCount: (s.files ?? []).length }))
  }
  return (general.files ?? []).map(f => ({ name: f.name, fileCount: 0 }))
}

const PREVIEW_BANNER = (
  <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-950">
    <Info className="h-3.5 w-3.5 shrink-0 text-rose-600" />
    <span className="text-[0.75rem] font-medium">
      This is a demo firm — sample data is shown for preview only. Sign up for a paid plan to manage real client files.
    </span>
  </div>
)

// ---------------------------------------------------------------------------
// SandboxBoardPreview
// ---------------------------------------------------------------------------

const LANES: { status: ActivityStatus; label: string; icon: React.ReactNode; iconBg: string }[] = [
  { status: 'to_do', label: 'To Do', icon: <ListTodo className="h-3.5 w-3.5 text-[#45474c]" />, iconBg: 'bg-[#f3f4f6]' },
  { status: 'in_progress', label: 'In Progress', icon: <PenLine className="h-3.5 w-3.5 text-[#5A78FF]" />, iconBg: 'bg-[#eff2ff]' },
  { status: 'in_review', label: 'In Review', icon: <Eye className="h-3.5 w-3.5 text-[#c2410c]" />, iconBg: 'bg-[#fff7ed]' },
  { status: 'approved', label: 'Approved', icon: <CheckCircle className="h-3.5 w-3.5 text-primary" />, iconBg: 'bg-primary/10' },
]

const CARD_ACCENT: Record<ActivityStatus, string> = {
  to_do: 'bg-[#f3f4f6]',
  in_progress: 'bg-[#eff2ff]',
  in_review: 'bg-[#fff7ed]',
  approved: 'bg-primary/10',
}

function SandboxBoardCard({ name, status, fileCount, idx }: { name: string; status: ActivityStatus; fileCount: number; idx: number }) {
  const daysAgo = (idx + 1) * 3
  const ts = new Date(Date.now() - daysAgo * 86400000).toISOString()
  return (
    <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden opacity-80 pointer-events-none select-none">
      <div className={cn('h-1', CARD_ACCENT[status])} />
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-[#1b1b1d] leading-snug line-clamp-2">{name.replace(/_/g, ' ')}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#9a9ba0]">
          {fileCount > 0 && <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>}
          <span><RelativeDateTime date={ts} /></span>
        </div>
      </div>
    </div>
  )
}

export function SandboxBoardPreview({ projectName }: { projectName?: string }) {
  const deliverables = getDeliverables(projectName)

  const byLane: Record<ActivityStatus, typeof deliverables> = { to_do: [], in_progress: [], in_review: [], approved: [] }
  deliverables.forEach((d, i) => {
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length]
    byLane[status].push(d)
  })

  return (
    <div className="relative select-none">
      {PREVIEW_BANNER}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-4 min-h-[360px]">
          {LANES.map((lane) => (
            <div key={lane.status} className="flex flex-col rounded border border-[#e5e7eb] bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#e5e7eb]">
                <div className={cn('rounded p-1', lane.iconBg)}>{lane.icon}</div>
                <span className="text-xs font-semibold text-[#1b1b1d]">{lane.label}</span>
                <span className="text-[11px] text-[#9a9ba0] ml-0.5">({byLane[lane.status].length})</span>
              </div>
              <div className="flex-1 p-3 space-y-2.5 min-h-[120px]">
                {byLane[lane.status].map((d, i) => (
                  <SandboxBoardCard key={d.name} name={d.name} status={lane.status} fileCount={d.fileCount} idx={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SandboxCommentsPreview
// ---------------------------------------------------------------------------

const DEMO_COMMENT_PREVIEWS = [
  "This looks great overall. Can we tighten the executive summary — the main recommendation should come in the first paragraph.",
  "A few data points in section 3 look like they're from the Q3 model. Should these be updated to reflect Q4 actuals?",
  "Client requested a version without the appendix for the board presentation. Can we prepare a slimmed-down copy?",
]

export function SandboxCommentsPreview({ projectName }: { projectName?: string }) {
  const deliverables = getDeliverables(projectName)
  const rows = deliverables.slice(0, 3).map((d, i) => ({
    name: d.name.replace(/_/g, ' '),
    count: 3 - i,
    preview: DEMO_COMMENT_PREVIEWS[i] ?? DEMO_COMMENT_PREVIEWS[0],
    ts: new Date(Date.now() - (i + 1) * 4 * 86400000).toISOString(),
  }))

  return (
    <div className="relative select-none p-4 flex flex-col gap-3">
      {/* Banner inside the tab content area */}
      <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded text-rose-950">
        <Info className="h-3.5 w-3.5 shrink-0 text-rose-600" />
        <span className="text-[0.75rem] font-medium">
          This is a demo firm — sample comments are shown for preview only. Sign up for a paid plan to collaborate on real documents.
        </span>
      </div>

      {/* Mock tab bar */}
      <div className="flex items-center gap-1 border-b border-[#e5e7eb] pb-0">
        <div className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 border-brand-accent -mb-px text-[#1b1b1d]">
          <MessagesSquare className="h-3.5 w-3.5" />
          All Comments
          <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
            {rows.reduce((s, r) => s + r.count, 0)}
          </span>
        </div>
      </div>

      {/* Mock comment rows */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden pointer-events-none opacity-80">
        <div className="divide-y divide-[#e5e7eb]">
          {rows.map((r) => (
            <div key={r.name} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <MessagesSquare className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1b1b1d] truncate">{r.name}</span>
                  <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums leading-none">
                    {r.count}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[#45474c] line-clamp-1">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[#9a9ba0] mr-1.5">Latest</span>
                  {r.preview}
                </div>
                <div className="mt-1 text-[10px] text-[#9a9ba0] flex items-center gap-1">
                  <span>Last comment</span>
                  <RelativeDateTime date={r.ts} />
                </div>
              </div>
              <div className="shrink-0 text-[#9a9ba0]">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SandboxAuditPreview
// ---------------------------------------------------------------------------

type MockAuditRow = {
  id: string
  eventScope: string
  eventAction: string
  details: string
  actorName: string
  offsetDays: number
  offsetHours?: number
  icon: React.ReactNode
}

function buildAuditRows(projectName?: string): MockAuditRow[] {
  const eng = findEngagement(projectName)
  const engName = eng?.name ?? 'Engagement'
  const general = eng?.structure['General']
  const subfolders = (general as any)?.subfolders ?? []
  const firstFile = subfolders[0]?.files?.[0]?.name ?? 'Strategy Plan.docx'
  const secondFile = subfolders[1]?.files?.[0]?.name ?? 'GTM Strategy Deck.pptx'
  const firstSub = (subfolders[0]?.name ?? 'Discovery').replace(/_/g, ' ')
  const secondSub = (subfolders[1]?.name ?? 'Analysis').replace(/_/g, ' ')

  return [
    { id: 'r1', eventScope: 'Engagement', eventAction: 'Created', details: engName, actorName: 'Alex Jordan', offsetDays: 30, icon: <Briefcase className="h-4 w-4 text-blue-600" /> },
    { id: 'r2', eventScope: 'Engagement', eventAction: 'Member change', details: 'Sam Rivera added as member', actorName: 'Alex Jordan', offsetDays: 28, icon: <UserPlus className="h-4 w-4 text-blue-400" /> },
    { id: 'r3', eventScope: 'File', eventAction: 'Created', details: firstFile, actorName: 'Alex Jordan', offsetDays: 20, icon: <FileUp className="h-4 w-4 text-blue-600" /> },
    { id: 'r4', eventScope: 'File', eventAction: 'Created', details: secondFile, actorName: 'Sam Rivera', offsetDays: 18, icon: <FileUp className="h-4 w-4 text-blue-600" /> },
    { id: 'r5', eventScope: 'File', eventAction: 'Shared', details: firstFile, actorName: 'Alex Jordan', offsetDays: 14, icon: <Share2 className="h-4 w-4 text-purple-600" /> },
    { id: 'r6', eventScope: 'File', eventAction: 'Opened', details: firstFile, actorName: 'Sam Rivera', offsetDays: 13, offsetHours: 4, icon: <Eye className="h-4 w-4 text-slate-500" /> },
    { id: 'r7', eventScope: 'File', eventAction: 'Commented', details: firstSub, actorName: 'Alex Jordan', offsetDays: 10, icon: <MessageSquare className="h-4 w-4 text-amber-500" /> },
    { id: 'r8', eventScope: 'File', eventAction: 'Shared', details: secondFile, actorName: 'Sam Rivera', offsetDays: 8, icon: <Share2 className="h-4 w-4 text-purple-600" /> },
    { id: 'r9', eventScope: 'File', eventAction: 'Commented', details: secondSub, actorName: 'Sam Rivera', offsetDays: 6, icon: <MessageSquare className="h-4 w-4 text-amber-500" /> },
    { id: 'r10', eventScope: 'File', eventAction: 'Finalized', details: firstFile, actorName: 'Alex Jordan', offsetDays: 3, icon: <CheckCircle className="h-4 w-4 text-primary" /> },
    { id: 'r11', eventScope: 'Engagement', eventAction: 'Modified', details: 'Status updated', actorName: 'Alex Jordan', offsetDays: 1, icon: <Briefcase className="h-4 w-4 text-blue-600" /> },
  ]
}

function initials(name: string) {
  return name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)
}

export function SandboxAuditPreview({ projectName }: { projectName?: string }) {
  const rows = buildAuditRows(projectName)
  const now = Date.now()

  return (
    <div className="flex flex-col h-full min-h-0 select-none pointer-events-none">
      <div className="flex items-center gap-2 px-0 py-2 bg-rose-50 border border-rose-200 rounded text-rose-950 mb-3">
        <Info className="h-3.5 w-3.5 shrink-0 text-rose-600 ml-3" />
        <span className="text-[0.75rem] font-medium">
          This is a demo firm — sample audit events are shown for preview only. Sign up for a paid plan to see real activity.
        </span>
      </div>

      <p className="text-xs text-gray-400 mb-3">Audit history is permanent and cannot be edited.</p>

      <div className="flex flex-wrap items-end gap-2 mb-4 opacity-40">
        {['From date', 'To date', 'Event scope', 'Event type', 'Actor'].map((label) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{label}</label>
            <div className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2 text-gray-400">
              <span>All</span>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500 mb-2">
        Showing <span className="font-medium text-gray-700">{rows.length}</span> rows
      </div>

      <div className="flex-1 overflow-auto min-h-0 bg-white border border-[#e5e7eb] rounded opacity-80">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-[#e5e7eb] sticky top-0">
            <tr>
              {['Date', 'Event scope', 'Event type', 'Details', 'Actor'].map((col) => (
                <th key={col} className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {rows.map((row) => {
              const ts = new Date(now - row.offsetDays * 86400000 - (row.offsetHours ?? 0) * 3600000).toISOString()
              return (
                <tr key={row.id} className="hover:bg-[#f9f9fb]">
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <RelativeDateTime date={ts} displayFormat="short" textClassName="text-[#45474c] text-[0.8125rem]" />
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      {row.icon}
                      <span className="text-[#45474c] text-[0.8125rem]">{row.eventScope}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-[#1b1b1d] text-[0.8125rem]">{row.eventAction}</span>
                  </td>
                  <td className="py-2.5 px-3 text-[0.8125rem] text-gray-700 max-w-[220px] truncate">{row.details}</td>
                  <td className="py-2.5 px-3 text-[0.8125rem]">
                    <div className="flex items-center gap-1.5">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-primary">{initials(row.actorName)}</span>
                      </div>
                      <span className="text-[#45474c] truncate max-w-[140px]">{row.actorName}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
