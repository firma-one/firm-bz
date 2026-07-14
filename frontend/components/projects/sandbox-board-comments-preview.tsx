'use client'

import React, { useState } from 'react'
import {
  ListTodo, PenLine, Eye, CheckCircle, MessagesSquare, ArrowRight,
  Briefcase, FileUp, Share2, UserPlus, MessageSquare, PackagePlus, PackageCheck,
  Activity, ClipboardCheck, Target, Gauge, Timer, BarChart2, AlertTriangle,
  AlertCircle, RefreshCw, Info, Settings, X, Folder, MoreVertical,
  FileText, FileSpreadsheet, FileImage, File,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import sandboxHierarchyJson from '@/lib/services/sandbox-hierarchy.json'
import type { SandboxEngagement } from './sandbox-file-preview'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'

const STATUS_CYCLE: ActivityStatus[] = ['in_progress', 'in_review', 'to_do', 'approved', 'in_progress', 'in_review']

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


// ---------------------------------------------------------------------------
// SandboxBoardPreview — matches real board design exactly
// ---------------------------------------------------------------------------

const LANE_THEME: Record<ActivityStatus, {
  headerBg: string; headerBorder: string
  iconBg: string; iconColor: string
  labelColor: string; countBg: string; countColor: string
  progressColor: string; cardIconBg: string; cardIconColor: string
}> = {
  to_do: {
    headerBg: 'bg-[#fdf3e0]', headerBorder: 'border-[#f5e2b8]',
    iconBg: 'bg-[#f3b52f]', iconColor: 'text-white',
    labelColor: 'text-[#9a6b12]', countBg: 'bg-[#f9e6bd]', countColor: 'text-[#9a6b12]',
    progressColor: '#f3b52f', cardIconBg: 'bg-[#fdf3e0]', cardIconColor: 'text-[#c8891a]',
  },
  in_progress: {
    headerBg: 'bg-[#e7edff]', headerBorder: 'border-[#c9d7ff]',
    iconBg: 'bg-[#3b5bfd]', iconColor: 'text-white',
    labelColor: 'text-[#2a3fb0]', countBg: 'bg-[#d3ddff]', countColor: 'text-[#2a3fb0]',
    progressColor: '#3b5bfd', cardIconBg: 'bg-[#e7edff]', cardIconColor: 'text-[#3b5bfd]',
  },
  in_review: {
    headerBg: 'bg-[#f1eaff]', headerBorder: 'border-[#ddd0ff]',
    iconBg: 'bg-[#7c3aed]', iconColor: 'text-white',
    labelColor: 'text-[#5b21b6]', countBg: 'bg-[#e2d4ff]', countColor: 'text-[#5b21b6]',
    progressColor: '#7c3aed', cardIconBg: 'bg-[#f1eaff]', cardIconColor: 'text-[#7c3aed]',
  },
  approved: {
    headerBg: 'bg-[#e2f6ea]', headerBorder: 'border-[#bfe9d1]',
    iconBg: 'bg-[#0d9f5f]', iconColor: 'text-white',
    labelColor: 'text-[#0d6b41]', countBg: 'bg-[#c7ecd8]', countColor: 'text-[#0d6b41]',
    progressColor: '#0d9f5f', cardIconBg: 'bg-[#e2f6ea]', cardIconColor: 'text-[#0d9f5f]',
  },
}

const BOARD_LANES: { status: ActivityStatus; label: string; icon: React.ReactNode }[] = [
  { status: 'to_do', label: 'To Do', icon: <ListTodo className="h-3.5 w-3.5 text-white" /> },
  { status: 'in_progress', label: 'In Progress', icon: <PenLine className="h-3.5 w-3.5 text-white" /> },
  { status: 'in_review', label: 'In Review', icon: <Eye className="h-3.5 w-3.5 text-white" /> },
  { status: 'approved', label: 'Approved', icon: <CheckCircle className="h-3.5 w-3.5 text-white" /> },
]


function SandboxBoardCard({
  name, docId, status, fileCount, actor, isApproved, isOverdue, subtasksDone,
}: {
  name: string; docId: string; status: ActivityStatus; fileCount: number; actor: string; isApproved: boolean; isOverdue?: boolean; subtasksDone?: number
}) {
  const theme = LANE_THEME[status]
  const initials = actor.split(' ').map(p => p[0]).join('')
  const done = subtasksDone ?? (isApproved ? fileCount : Math.max(1, Math.floor(fileCount * 0.5)))

  return (
    <div className={cn('rounded border overflow-hidden', isApproved ? 'bg-[#0d9f5f]/[0.04] border-[#0d9f5f]/20' : isOverdue ? 'bg-red-50/40 border-red-200' : 'bg-white border-[#e5e7eb]')}>
      {/* icon + docId + name */}
      <div className={cn('border-b', isApproved ? 'border-[#0d9f5f]/10 bg-[#0d9f5f]/[0.06]' : isOverdue ? 'border-red-100 bg-red-50/60' : 'border-[#f1f1f3] bg-[#fdfdfe]')}>
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded', theme.cardIconBg)}>
            {isApproved
              ? <PackageCheck className={cn('h-4 w-4', theme.cardIconColor)} />
              : <PackagePlus className={cn('h-4 w-4', theme.cardIconColor)} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn('text-[11px] font-bold font-mono tracking-wide', theme.cardIconColor)}>{docId}</span>
              {isOverdue && (
                <span className="text-[9px] font-semibold text-red-600 bg-red-100 px-1 py-0.5 rounded">Overdue</span>
              )}
            </div>
            <span className="truncate text-[11px] font-medium text-[#5b5d64] block">
              {name.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>
      {/* Updated by + subtask bar */}
      <div className="px-3 pb-2.5 pt-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[#6b6d75] w-14 shrink-0">Updated by</span>
          <div className="flex items-center gap-1">
            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-[8px] font-bold text-primary">{initials}</span>
            </div>
            <span className="text-[11px] text-[#45474c] truncate">{actor}</span>
          </div>
        </div>
        {fileCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-[#e5e7eb] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round((done / fileCount) * 100)}%`, backgroundColor: isOverdue ? '#ef4444' : theme.progressColor }}
              />
            </div>
            <span className="text-[9px] font-semibold text-[#6b6d75] tabular-nums shrink-0">
              {done}/{fileCount}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const BOARD_DELIVERABLES: Array<{ name: string; docId: string; status: ActivityStatus; fileCount: number; actor: string; isOverdue?: boolean }> = [
  { name: '01_Research & Insights',       docId: 'VFH-46', status: 'approved',     fileCount: 4, actor: 'Alex Jordan' },
  { name: '02_Strategy & Messaging',      docId: 'VFH-54', status: 'in_review',    fileCount: 6, actor: 'Sam Rivera' },
  { name: '03_Enablement & Launch',       docId: 'VFH-84', status: 'in_progress',  fileCount: 9, actor: 'Jordan Lee' },
  { name: '04_Compliance & Legal Review', docId: 'VFH-65', status: 'in_review',    fileCount: 3, actor: 'Taylor Kim', isOverdue: true },
]

// Static subtask data per deliverable
const SUBTASK_DATA: Record<string, Array<{ name: string; mime: string; status: ActivityStatus; breadcrumb: string[] }>> = {
  'VFH-46': [
    { name: 'Market_Research_Report.docx',    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'approved', breadcrumb: ['01_Research & Insights', 'Reports'] },
    { name: 'Competitive_Analysis.xlsx',       mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      status: 'approved', breadcrumb: ['01_Research & Insights', 'Data'] },
    { name: 'Customer_Interviews_Summary.pdf', mime: 'application/pdf',                                                         status: 'approved', breadcrumb: ['01_Research & Insights', 'Interviews'] },
    { name: 'Insights_Deck_Final.pptx',        mime: 'application/vnd.ms-powerpoint',                                          status: 'approved', breadcrumb: ['01_Research & Insights'] },
  ],
  'VFH-54': [
    { name: 'GTM_Strategy_Deck_v3.pptx',       mime: 'application/vnd.ms-powerpoint',                                          status: 'in_review',   breadcrumb: ['02_Strategy & Messaging'] },
    { name: 'ICP_Analysis_Final.docx',          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'in_review',   breadcrumb: ['02_Strategy & Messaging', 'Research'] },
    { name: 'Messaging_Framework.docx',         mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'approved',    breadcrumb: ['02_Strategy & Messaging'] },
    { name: 'Positioning_Brief.pdf',            mime: 'application/pdf',                                                         status: 'approved',    breadcrumb: ['02_Strategy & Messaging', 'Briefs'] },
    { name: 'Channel_Mix_Plan.xlsx',            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      status: 'in_progress', breadcrumb: ['02_Strategy & Messaging', 'Planning'] },
    { name: 'Launch_Readiness_Checklist.xlsx',  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      status: 'to_do',       breadcrumb: ['02_Strategy & Messaging', 'Planning'] },
  ],
  'VFH-84': [
    { name: '01_Sales_Playbooks_&_Battlecards.pptx',  mime: 'application/vnd.ms-powerpoint',  status: 'in_review',   breadcrumb: ['03_Enablement & Launch', '01_Sales_Playbooks'] },
    { name: '01_Sales_Playbooks_&_Battlecards.docx',  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'approved', breadcrumb: ['03_Enablement & Launch', '01_Sales_Playbooks'] },
    { name: '02_Internal_Training_&_Screencasts.docx',mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'in_progress', breadcrumb: ['03_Enablement & Launch', '02_Internal_Training'] },
    { name: '03_External_PR_&_Launch_Assets.xlsx',    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'to_do', breadcrumb: ['03_Enablement & Launch', '03_External_PR'] },
    { name: '03_External_PR_&_Launch_Assets.pptx',    mime: 'application/vnd.ms-powerpoint',  status: 'to_do', breadcrumb: ['03_Enablement & Launch', '03_External_PR'] },
    { name: 'Launch_Timeline.xlsx',                   mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'to_do', breadcrumb: ['03_Enablement & Launch'] },
    { name: 'PR_Press_Release_Draft.docx',            mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'to_do', breadcrumb: ['03_Enablement & Launch', '03_External_PR'] },
    { name: 'Social_Campaign_Brief.pdf',              mime: 'application/pdf', status: 'to_do', breadcrumb: ['03_Enablement & Launch'] },
    { name: 'Event_Run_of_Show.docx',                 mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'to_do', breadcrumb: ['03_Enablement & Launch'] },
  ],
  'VFH-65': [
    { name: 'Compliance_Checklist_v2.xlsx',    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      status: 'in_review',   breadcrumb: ['04_Compliance & Legal Review'] },
    { name: 'Legal_Sign-off_Brief.pdf',        mime: 'application/pdf',                                                         status: 'to_do',       breadcrumb: ['04_Compliance & Legal Review', 'Legal'] },
    { name: 'Data_Privacy_Assessment.docx',    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'to_do',       breadcrumb: ['04_Compliance & Legal Review', 'Privacy'] },
  ],
}

const STAGE_LABELS_LOCAL: Record<ActivityStatus, string> = {
  to_do: 'To Do', in_progress: 'In Progress', in_review: 'In Review', approved: 'Approved',
}
const STAGE_COLOR_LOCAL: Record<ActivityStatus, string> = {
  to_do: 'bg-[#f3b52f] text-white', in_progress: 'bg-[#3b5bfd] text-white',
  in_review: 'bg-[#7c3aed] text-white', approved: 'bg-[#0d9f5f] text-white',
}
const STAGE_ICON_SMALL: Record<ActivityStatus, React.ReactNode> = {
  to_do: <ListTodo className="h-3 w-3" />, in_progress: <PenLine className="h-3 w-3" />,
  in_review: <Eye className="h-3 w-3" />, approved: <CheckCircle className="h-3 w-3" />,
}

function SubtaskMimeIcon({ mime }: { mime: string }) {
  const m = mime.toLowerCase()
  if (m.includes('pdf')) return <FileText className="h-3.5 w-3.5 text-red-400 shrink-0" />
  if (m.includes('sheet') || m.includes('excel')) return <FileSpreadsheet className="h-3.5 w-3.5 text-green-500 shrink-0" />
  if (m.includes('presentation') || m.includes('powerpoint')) return <FileImage className="h-3.5 w-3.5 text-orange-400 shrink-0" />
  if (m.includes('word') || m.includes('document')) return <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
  return <File className="h-3.5 w-3.5 text-gray-400 shrink-0" />
}

function SandboxDeliverablePanel({ deliverable, onClose }: {
  deliverable: typeof BOARD_DELIVERABLES[number]
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'settings'>('details')
  const subtasks = SUBTASK_DATA[deliverable.docId] ?? []
  const approvedCount = subtasks.filter(s => s.status === 'approved').length
  const pct = subtasks.length > 0 ? Math.round((approvedCount / subtasks.length) * 100) : 0
  const theme = LANE_THEME[deliverable.status]

  const dueDateLabel = deliverable.isOverdue ? 'Jul 12' : deliverable.status === 'in_progress' ? 'Jul 26' : 'Jul 19'

  return (
    <div className="w-[340px] shrink-0 flex flex-col h-full bg-white border-l border-[#e5e7eb] overflow-hidden select-none pointer-events-none">
      {/* Stage badge row */}
      <div className="px-4 py-2.5 border-b border-[#e5e7eb] flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 h-9 px-2 rounded border border-[#e5e7eb] bg-white text-[10px] font-bold font-mono uppercase tracking-widest text-[#45474c]">
          <span className={cn('flex items-center justify-center h-5 w-5 rounded shrink-0', STAGE_COLOR_LOCAL[deliverable.status])}>
            {STAGE_ICON_SMALL[deliverable.status]}
          </span>
          {STAGE_LABELS_LOCAL[deliverable.status]}
        </span>
        <span className={cn('inline-flex items-center h-9 px-2 rounded border text-[10px] font-bold font-mono uppercase tracking-widest', deliverable.isOverdue ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#e5e7eb] bg-white text-[#45474c]')}>
          Due {dueDateLabel}
        </span>
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded text-gray-400 hover:text-gray-600 pointer-events-auto">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] shrink-0">
        {([
          { id: 'details',  label: 'Details',  Icon: Info },
          { id: 'comments', label: 'Comments', Icon: MessagesSquare },
          { id: 'settings', label: 'Settings', Icon: Settings },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} type="button"
            className={cn(
              'inline-flex items-center px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all pointer-events-auto',
              activeTab === id ? 'border-primary text-[#1b1b1d] font-bold opacity-100' : 'border-transparent text-[#45474c] opacity-60'
            )}
            onClick={() => setActiveTab(id)}
          >
            <Icon className="w-3.5 h-3.5 mr-1.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'details' && (
          <div className="divide-y divide-[#e5e7eb]">
            {/* Description */}
            <div className="px-4 py-4">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1.5">Description</span>
              <p className="text-xs text-[#45474c] leading-relaxed">
                {deliverable.docId === 'VFH-46' && 'Comprehensive market research and competitive analysis to inform the go-to-market strategy. All interviews completed and insights synthesized.'}
                {deliverable.docId === 'VFH-54' && 'GTM strategy, ICP definition, messaging framework and channel mix plan. Awaiting client approval on final positioning brief.'}
                {deliverable.docId === 'VFH-84' && 'Sales enablement materials, training assets, PR/launch assets, and event planning. In progress — sales playbooks under review.'}
                {deliverable.docId === 'VFH-65' && 'Legal and compliance sign-off required before launch. Compliance checklist under review. Due date has passed — needs escalation.'}
              </p>
            </div>

            {/* Documents */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] shrink-0">
                  Documents · {subtasks.length}
                </span>
                {subtasks.length > 0 && (
                  <>
                    <div className="flex-1 h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold text-[#9a9ba0] shrink-0 tabular-nums">{approvedCount}/{subtasks.length}</span>
                  </>
                )}
              </div>
              <div className="divide-y divide-[#e5e7eb] -mx-4 border-t border-b border-[#e5e7eb] mt-2">
                {subtasks.map((s, i) => (
                  <div key={i} className="group py-2 px-3">
                    <div className="flex items-center gap-2.5">
                      <SubtaskMimeIcon mime={s.mime} />
                      <span className="flex-1 min-w-0 truncate text-xs text-[#1b1b1d]">{s.name}</span>
                      <span className={cn('flex items-center justify-center h-5 w-5 rounded shrink-0', STAGE_COLOR_LOCAL[s.status])}>
                        {STAGE_ICON_SMALL[s.status]}
                      </span>
                      <MoreVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 pl-6 min-w-0">
                      <Folder className="h-2.5 w-2.5 shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200" />
                      {s.breadcrumb.map((seg, j) => (
                        <span key={j} className="flex items-center gap-1 min-w-0">
                          {j > 0 && <span className="text-[#c8c9cc] text-xs shrink-0">/</span>}
                          <span className="text-xs text-slate-500 shrink-0">{seg}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
            <MessagesSquare className="h-8 w-8 text-gray-200" />
            <p className="text-xs font-medium text-gray-400">No comment threads yet</p>
            <p className="text-[10px] text-gray-300">Comments from collaborators and reviewers appear here.</p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="px-4 py-4 flex flex-col gap-4">
            <div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-3">Collaborator Access</span>
              <div className="flex flex-col divide-y divide-[#e5e7eb]">
                {[
                  { label: 'Allow download', checked: false },
                ].map(({ label, checked }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <span className="text-xs text-[#45474c]">{label}</span>
                    <div className={cn('w-8 h-4 rounded-full relative', checked ? 'bg-primary' : 'bg-gray-200')}>
                      <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', checked ? 'left-4' : 'left-0.5')} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-3">Reviewer Access</span>
              <div className="flex flex-col divide-y divide-[#e5e7eb]">
                {[
                  { label: 'Allow download', checked: false },
                  { label: 'PDF only', checked: true },
                  { label: 'Add watermark', checked: false },
                ].map(({ label, checked }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <span className="text-xs text-[#45474c]">{label}</span>
                    <div className={cn('w-8 h-4 rounded-full relative', checked ? 'bg-primary' : 'bg-gray-200')}>
                      <div className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', checked ? 'left-4' : 'left-0.5')} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function SandboxBoardPreview({ projectName: _projectName }: { projectName?: string }) {
  const [selectedDocId, setSelectedDocId] = useState<string>('VFH-54')
  const total = BOARD_DELIVERABLES.length
  const selectedDeliverable = BOARD_DELIVERABLES.find(d => d.docId === selectedDocId) ?? null

  const byLane: Record<ActivityStatus, typeof BOARD_DELIVERABLES> = {
    to_do: [], in_progress: [], in_review: [], approved: [],
  }
  BOARD_DELIVERABLES.forEach((d) => {
    byLane[d.status].push(d)
  })

  return (
    <div className="flex h-full select-none">
      {/* Board lanes */}
      <div className="flex-1 min-w-0 pointer-events-none p-4">
        <div className="grid grid-cols-4 gap-4">
          {BOARD_LANES.map((lane) => {
            const theme = LANE_THEME[lane.status]
            const laneCards = byLane[lane.status]
            const lanePct = total > 0 ? (laneCards.length / total) * 100 : 0
            return (
              <div key={lane.status} className="flex flex-col gap-2">
                {/* Lane header */}
                <div className={cn('flex flex-col rounded border overflow-hidden shrink-0', theme.headerBg, theme.headerBorder)}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className={cn('rounded p-1', theme.iconBg)}>{lane.icon}</div>
                    <span className={cn('text-xs font-semibold', theme.labelColor)}>{lane.label}</span>
                    <span className={cn('text-[11px] ml-0.5 tabular-nums px-1.5 py-0.5 rounded font-medium', theme.countBg, theme.countColor)}>
                      {laneCards.length}/{total}
                    </span>
                  </div>
                  <div className="h-1 bg-black/5 shrink-0">
                    <div className="h-full transition-all" style={{ width: `${lanePct}%`, backgroundColor: theme.progressColor }} />
                  </div>
                </div>
                {/* Lane body */}
                <div className="flex flex-col rounded bg-[#f9f9fb] p-3 gap-2.5 min-h-[120px]">
                  {laneCards.map((d) => (
                    <div
                      key={d.name}
                      className={cn('pointer-events-auto cursor-pointer rounded ring-2 transition-all', selectedDocId === d.docId ? 'ring-primary' : 'ring-transparent hover:ring-gray-200')}
                      onClick={() => setSelectedDocId(d.docId)}
                    >
                      <SandboxBoardCard
                        name={d.name}
                        docId={d.docId}
                        status={lane.status}
                        fileCount={d.fileCount}
                        actor={d.actor}
                        isApproved={lane.status === 'approved'}
                        isOverdue={d.isOverdue}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail pane */}
      {selectedDeliverable && (
        <SandboxDeliverablePanel
          deliverable={selectedDeliverable}
          onClose={() => setSelectedDocId('')}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SandboxInsightsPreview — matches EngagementInsightsDashboard layout
// ---------------------------------------------------------------------------

type RingDatum = { label: string; score: number; color: string; icon: React.ReactNode }

const MOCK_RINGS: RingDatum[] = [
  { label: 'Delivery Status',       score: 78, color: '#3b5bfd', icon: <ClipboardCheck className="h-4 w-4" /> },
  { label: 'Delivery Schedule',     score: 85, color: '#0d9f5f', icon: <Target className="h-4 w-4" /> },
  { label: 'Planning Hygiene',      score: 62, color: '#f3b52f', icon: <ClipboardCheck className="h-4 w-4" /> },
  { label: 'Comment Responsiveness',score: 91, color: '#7c3aed', icon: <MessagesSquare className="h-4 w-4" /> },
  { label: 'Pace',                  score: 70, color: '#0ea5e9', icon: <Gauge className="h-4 w-4" /> },
  { label: 'First-Time-Right',      score: 83, color: '#0d9f5f', icon: <Target className="h-4 w-4" /> },
]

const MOCK_DELIVERABLES = [
  { name: '01_Research & Insights',       stage: 'approved',     pct: 100, total: 4 },
  { name: '02_Strategy & Messaging',      stage: 'in_review',    pct: 75,  total: 6 },
  { name: '03_Enablement & Launch',       stage: 'in_progress',  pct: 44,  total: 9 },
  { name: '04_Compliance & Legal Review', stage: 'in_review',    pct: 33,  total: 3 },
]

const MOCK_RECENT = [
  { name: 'GTM_Strategy_Deck_v3.pptx', daysAgo: 0 },
  { name: 'ICP_Analysis_Final.docx', daysAgo: 1 },
  { name: 'Brand_Positioning_Brief.pdf', daysAgo: 2 },
]

const STAGE_COLOR: Record<string, string> = {
  approved: '#0d9f5f', in_review: '#7c3aed', in_progress: '#3b5bfd', to_do: '#f3b52f',
}
const STAGE_LABEL: Record<string, string> = {
  approved: 'Approved', in_review: 'In Review', in_progress: 'In Progress', to_do: 'To Do',
}

function MiniRing({ score, color, size = 52 }: { score: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f1f3" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1b1b1d">
        {score}
      </text>
    </svg>
  )
}

export function SandboxInsightsPreview({ projectName }: { projectName?: string }) {
  const deliverables = getDeliverables(projectName)
  const mockDeliverables = deliverables.length > 0
    ? deliverables.map((d, i) => ({
        name: d.name.replace(/_/g, ' '),
        stage: STATUS_CYCLE[i % STATUS_CYCLE.length],
        pct: [100, 75, 44, 33, 60, 80][i % 6],
        total: d.fileCount || 4,
      }))
    : MOCK_DELIVERABLES

  return (
    <div className="select-none pointer-events-none">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left card */}
        <div className="bg-white border border-[#e5e7eb] rounded p-6 flex flex-col gap-6 shadow-md">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900">Engagement Insights</h2>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50">
                Due in 18d
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-gray-100">
              <RefreshCw className="h-4 w-4 text-gray-700" />
            </div>
          </div>

          {/* Health score + rings */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">Engagement Health</span>
            </div>
            {/* Overall score */}
            <div className="flex items-center gap-4 p-4 rounded-lg border border-[#e5e7eb] bg-[#f9f9fb]">
              <MiniRing score={78} color="#0d9f5f" size={64} />
              <div>
                <p className="text-sm font-bold text-gray-900">Overall Health Score</p>
                <p className="text-xs text-gray-500 mt-0.5">Based on 6 engagement signals</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#0d9f5f]" />
                  <span className="text-[11px] text-gray-600 font-medium">On track</span>
                </div>
              </div>
            </div>
            {/* Sub-rings grid */}
            <div className="grid grid-cols-3 gap-3">
              {MOCK_RINGS.map((r) => (
                <div key={r.label} className="flex flex-col items-center gap-1.5 p-3 rounded border border-[#e5e7eb] bg-white">
                  <MiniRing score={r.score} color={r.color} size={48} />
                  <span className="text-[10px] text-center text-gray-500 leading-tight">{r.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deliverables progress */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">Deliverables Progress</span>
            </div>
            <div className="flex flex-col gap-2">
              {mockDeliverables.map((d) => (
                <div key={d.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-700 truncate max-w-[260px]">{d.name}</span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-2 shrink-0"
                      style={{ backgroundColor: `${STAGE_COLOR[d.stage]}18`, color: STAGE_COLOR[d.stage] }}
                    >
                      {STAGE_LABEL[d.stage]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${d.pct}%`, backgroundColor: STAGE_COLOR[d.stage] }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{d.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Deliverables', value: mockDeliverables.length, icon: <ClipboardCheck className="h-4 w-4 text-primary" />, bg: 'bg-primary/5' },
              { label: 'Approved', value: mockDeliverables.filter(d => d.stage === 'approved').length, icon: <CheckCircle className="h-4 w-4 text-[#0d9f5f]" />, bg: 'bg-[#e2f6ea]' },
              { label: 'In Review', value: mockDeliverables.filter(d => d.stage === 'in_review').length, icon: <Eye className="h-4 w-4 text-[#7c3aed]" />, bg: 'bg-[#f1eaff]' },
              { label: 'Overdue', value: 1, icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, bg: 'bg-amber-50' },
            ].map((t) => (
              <div key={t.label} className={cn('rounded border border-[#e5e7eb] p-3 flex flex-col gap-1.5', t.bg)}>
                <div className="flex items-center gap-1.5">
                  {t.icon}
                  <span className="text-[10px] font-medium text-gray-500">{t.label}</span>
                </div>
                <span className="text-2xl font-bold text-gray-900">{t.value}</span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div className="bg-white border border-[#e5e7eb] rounded p-4 flex flex-col gap-3">
            <span className="text-sm font-semibold text-gray-800">Recent Activity</span>
            <div className="flex flex-col gap-2">
              {MOCK_RECENT.map((f, i) => {
                const ts = new Date(Date.now() - f.daysAgo * 86400000).toISOString()
                return (
                  <div key={f.name} className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-[#e7edff] flex items-center justify-center shrink-0">
                      <FileUp className="h-3 w-3 text-[#3b5bfd]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{f.name}</p>
                      <RelativeDateTime date={ts} textClassName="text-[10px] text-gray-400" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Unanswered threads nudge */}
          <div className="bg-white border border-amber-200 rounded p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-semibold text-gray-800">2 unanswered comment threads</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Client is waiting on a response from the team.</p>
            </div>
          </div>
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
