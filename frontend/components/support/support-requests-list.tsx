'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { TicketType } from '@prisma/client'
import { AlertCircle, Lightbulb, HelpCircle, MessagesSquare, Copy, Check, Eye, Clock, ChevronDown, RefreshCw, Search, X, CircleChevronLeft } from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SupportTicketDetailsPane } from './support-ticket-details-pane'
import { SupportTicketCommentsPane } from './support-ticket-comments-pane'
import { useRightPane } from '@/lib/right-pane-context'

interface SupportRequest {
  id: string
  ticketNumber: string
  type: TicketType
  description: string
  comments?: any[]
  attachments?: any[]
  createdAt: Date
  updatedAt?: Date
  status?: string
  firm?: { name: string; slug: string }
  client?: { name: string; slug: string }
  engagement?: { name: string; slug: string }
}

interface SupportRequestsListProps {
  firmSlug: string
}

const TYPE_CONFIG = {
  [TicketType.BUG]: { label: 'Bug Report', icon: AlertCircle, color: 'text-rose-500', bgColor: 'bg-rose-50' },
  [TicketType.REQUEST]: { label: 'Feature Request', icon: Lightbulb, color: 'text-amber-500', bgColor: 'bg-amber-50' },
  [TicketType.ENQUIRY]: { label: 'General Enquiry', icon: HelpCircle, color: 'text-sky-500', bgColor: 'bg-sky-50' },
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-sky-50 text-sky-500 border-sky-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-500 border-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-500 border-emerald-200',
  CLOSED: 'bg-slate-50 text-slate-400 border-slate-200',
}

const ALL_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const ALL_TYPES = [TicketType.BUG, TicketType.REQUEST, TicketType.ENQUIRY]

type SortField = 'createdAt' | 'updatedAt'
type SortDir = 'asc' | 'desc'

export function SupportRequestsList({ firmSlug }: SupportRequestsListProps) {
  const rightPane = useRightPane()
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeDetailsTicketId, setActiveDetailsTicketId] = useState<string | null>(null)
  const [activeCommentTicketId, setActiveCommentTicketId] = useState<string | null>(null)
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null)

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterTypes, setFilterTypes] = useState<TicketType[]>([])

  // Sort
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const openDetailsPane = useCallback((request: SupportRequest) => {
    if (activeDetailsTicketId === request.ticketNumber) {
      rightPane.clearPane()
      setActiveDetailsTicketId(null)
      return
    }
    setActiveDetailsTicketId(request.ticketNumber)
    setActiveCommentTicketId(null)
    rightPane.setTitle(request.ticketNumber)
    rightPane.setHeaderIcon(<Eye className="h-4 w-4" />)
    rightPane.setHeaderSubtitle(
      request.type === 'BUG' ? 'Bug Report' :
      request.type === 'REQUEST' ? 'Feature Request' : 'General Enquiry'
    )
    rightPane.setContent(
      <SupportTicketDetailsPane
        firmSlug={firmSlug}
        ticket={request}
        onStatusUpdate={(newStatus) => {
          setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: newStatus } : r))
        }}
      />
    )
  }, [activeDetailsTicketId, rightPane, firmSlug])

  const openCommentsPane = useCallback((request: SupportRequest) => {
    if (activeCommentTicketId === request.ticketNumber) {
      rightPane.clearPane()
      setActiveCommentTicketId(null)
      return
    }
    setActiveCommentTicketId(request.ticketNumber)
    setActiveDetailsTicketId(null)
    rightPane.setTitle('Comments')
    rightPane.setHeaderIcon(<MessagesSquare className="h-4 w-4" />)
    rightPane.setHeaderSubtitle('Append-only. Visible to Firm Administrators.')
    rightPane.setContent(
      <SupportTicketCommentsPane
        ticketNumber={request.ticketNumber}
        initialComments={Array.isArray(request.comments) ? request.comments : []}
        onCommentsUpdate={(updated) => {
          setRequests(prev => prev.map(r =>
            r.ticketNumber === request.ticketNumber ? { ...r, comments: updated } : r
          ))
        }}
      />
    )
  }, [activeCommentTicketId, rightPane])

  // When the right pane is closed externally (X button), clear active states
  useEffect(() => {
    if (!rightPane.content) {
      setActiveCommentTicketId(null)
      setActiveDetailsTicketId(null)
    }
  }, [rightPane.content])

  const fetchRequests = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true)
      else setIsLoading(true)
      const response = await fetch(`/api/support/requests?firmSlug=${firmSlug}`)
      if (response.ok) {
        const data = await response.json()
        setRequests(data.map((r: any) => ({
          ...r,
          createdAt: new Date(r.createdAt),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : undefined,
        })))
      }
    } catch (error) {
      console.error('Failed to fetch support requests:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => { fetchRequests() }, [firmSlug])

  useEffect(() => {
    const handler = () => fetchRequests(true)
    window.addEventListener('support-requests-updated', handler)
    return () => window.removeEventListener('support-requests-updated', handler)
  }, [firmSlug])

  // Open search and focus input
  const openSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
  }

  const handleCopyTicketNumber = async (ticketNumber: string) => {
    await navigator.clipboard.writeText(ticketNumber)
    setCopiedTicketId(ticketNumber)
    setTimeout(() => setCopiedTicketId(null), 2000)
  }

  const toggleStatus = (s: string) =>
    setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const toggleType = (t: TicketType) =>
    setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const filteredAndSorted = useMemo(() => {
    let result = [...requests]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.ticketNumber.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      )
    }
    if (filterStatuses.length > 0) {
      result = result.filter(r => filterStatuses.includes(r.status || 'NEW'))
    }
    if (filterTypes.length > 0) {
      result = result.filter(r => filterTypes.includes(r.type))
    }
    result.sort((a, b) => {
      const va = (sortField === 'updatedAt' ? (a.updatedAt ?? a.createdAt) : a.createdAt).getTime()
      const vb = (sortField === 'updatedAt' ? (b.updatedAt ?? b.createdAt) : b.createdAt).getTime()
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return result
  }, [requests, searchQuery, filterStatuses, filterTypes, sortField, sortDir])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Loading requests...</div>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-[#e5e7eb] rounded">
        <div className="h-12 w-12 rounded bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center mb-4">
          <HelpCircle className="h-6 w-6 text-[#45474c]" />
        </div>
        <h3 className="font-headline text-base font-bold text-[#1b1b1d]">No requests yet</h3>
        <p className="text-[#45474c] text-sm mt-1">Create your first support request to get started.</p>
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {/* Left: filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "rounded-md border border-[#e5e7eb] px-2.5 py-1.5 text-xs bg-white flex items-center gap-1.5 text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors",
                  filterTypes.length > 0 && "border-primary text-primary"
                )}
              >
                Type
                {filterTypes.length > 0 && (
                  <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                    {filterTypes.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#e5e7eb]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#45474c] p-0 font-medium">Type</DropdownMenuLabel>
                {filterTypes.length > 0 && (
                  <button
                    className="text-xs rounded-[2px] bg-[#1b1b1d] text-white hover:bg-[#333] px-2 py-1"
                    onClick={() => setFilterTypes([])}
                  >
                    Clear
                  </button>
                )}
              </div>
              {ALL_TYPES.map(t => (
                <DropdownMenuCheckboxItem
                  key={t}
                  className="text-xs py-1.5 pl-8"
                  checked={filterTypes.includes(t)}
                  onCheckedChange={() => toggleType(t)}
                >
                  {TYPE_CONFIG[t].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Status filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "rounded-md border border-[#e5e7eb] px-2.5 py-1.5 text-xs bg-white flex items-center gap-1.5 text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors",
                  filterStatuses.length > 0 && "border-primary text-primary"
                )}
              >
                Status
                {filterStatuses.length > 0 && (
                  <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                    {filterStatuses.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[190px] py-1 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#e5e7eb]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#45474c] p-0 font-medium">Status</DropdownMenuLabel>
                {filterStatuses.length > 0 && (
                  <button
                    className="text-xs rounded-[2px] bg-[#1b1b1d] text-white hover:bg-[#333] px-2 py-1"
                    onClick={() => setFilterStatuses([])}
                  >
                    Clear
                  </button>
                )}
              </div>
              {ALL_STATUSES.map(s => (
                <DropdownMenuCheckboxItem
                  key={s}
                  className="text-xs py-1.5 pl-8"
                  checked={filterStatuses.includes(s)}
                  onCheckedChange={() => toggleStatus(s)}
                >
                  {s.replace(/_/g, ' ')}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: search + refresh */}
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tickets…"
                className="h-8 w-52 text-xs"
                onKeyDown={e => e.key === 'Escape' && closeSearch()}
              />
              <button
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-[#f3f4f6] text-[#45474c] transition-colors"
                onClick={closeSearch}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={openSearch}
                    className="h-8 w-8 flex items-center justify-center rounded border border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Search tickets</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => fetchRequests(true)}
                  className="h-8 w-8 flex items-center justify-center rounded border border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Refresh list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-white border-b border-[#e5e7eb] sticky top-0">
            <tr>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '160px' }}>Type</th>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '130px' }}>Ticket ID</th>
              <th className="px-3 py-2.5 text-center text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '70px' }}>Actions</th>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]">Description</th>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '125px' }}>Status</th>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '150px' }}>Created</th>
              <th className="px-3 py-2.5 text-left text-[0.8125rem] font-medium text-[#45474c]" style={{ width: '150px' }}>Modified</th>
              <th className="px-2 py-2.5 text-right" style={{ width: '80px' }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-[#f3f4f6] text-[#45474c] transition-colors"
                      title="Sort"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="8" y2="18" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] py-1 text-xs">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#45474c] py-1">Sort by</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortField === 'createdAt'} onCheckedChange={() => setSortField('createdAt')}>
                      Created
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortField === 'updatedAt'} onCheckedChange={() => setSortField('updatedAt')}>
                      Modified
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#45474c] py-1">Direction</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortDir === 'desc'} onCheckedChange={() => setSortDir('desc')}>
                      Newest first
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortDir === 'asc'} onCheckedChange={() => setSortDir('asc')}>
                      Oldest first
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-xs text-[#45474c]">
                  {searchQuery || filterStatuses.length > 0 || filterTypes.length > 0
                    ? 'No requests match the current filters.'
                    : 'No requests yet.'}
                </td>
              </tr>
            ) : filteredAndSorted.map((request) => {
              const config = TYPE_CONFIG[request.type]
              const Icon = config.icon
              const commentCount = Array.isArray(request.comments) ? request.comments.length : 0
              const statusColor = STATUS_COLORS[request.status || 'NEW']

              const isCommentActive = request.ticketNumber === activeCommentTicketId
              const isDetailsActive = request.ticketNumber === activeDetailsTicketId
              const isRowActive = isCommentActive || isDetailsActive

              return (
                <tr key={request.id} className={cn("hover:bg-[#f9f9fb] transition-colors", isRowActive && "bg-[#f9f9fb]")}>
                  {/* Type */}
                  <td className="px-3 py-2 overflow-hidden" style={{ width: '160px' }}>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${config.bgColor} ${config.color}`}>
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{config.label}</span>
                    </div>
                  </td>

                  {/* Ticket ID */}
                  <td className="px-3 py-2 overflow-hidden" style={{ width: '130px' }}>
                    <div className="flex items-center gap-1">
                      <code className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {request.ticketNumber}
                      </code>
                      <button
                        onClick={() => handleCopyTicketNumber(request.ticketNumber)}
                        className="p-0.5 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                        title="Copy ticket ID"
                      >
                        {copiedTicketId === request.ticketNumber ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2 text-center" style={{ width: '70px' }}>
                    <div className="flex items-center justify-center gap-1">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openDetailsPane(request)}
                              className={cn(
                                "p-1 rounded transition-colors",
                                isDetailsActive
                                  ? "bg-slate-200 text-slate-800"
                                  : "hover:bg-slate-200 text-slate-600"
                              )}
                              aria-pressed={isDetailsActive}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">View Details</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openCommentsPane(request)}
                              className={cn(
                                "p-1 rounded transition-colors",
                                isCommentActive
                                  ? "bg-slate-200 text-slate-800"
                                  : "hover:bg-slate-200 text-slate-600"
                              )}
                              aria-pressed={isCommentActive}
                            >
                              <MessagesSquare className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">Comments ({commentCount})</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-3 py-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-slate-700 truncate text-xs flex-1 min-w-0" title={request.description}>{request.description}</p>
                      {isRowActive && (
                        <CircleChevronLeft className="h-3.5 w-3.5 shrink-0 text-slate-500 animate-pulse" aria-label="Pane open" />
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2 overflow-hidden" style={{ width: '125px' }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusColor}`}>
                      {(request.status || 'NEW').replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-3 py-2 overflow-hidden" style={{ width: '150px' }}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-help whitespace-nowrap text-xs">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{formatDistanceToNow(request.createdAt, { addSuffix: true })}</span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {new Date(request.createdAt).toLocaleString()}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>

                  {/* Modified */}
                  <td className="px-3 py-2 overflow-hidden" style={{ width: '150px' }}>
                    {request.updatedAt ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-help whitespace-nowrap text-xs">
                            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{formatDistanceToNow(request.updatedAt, { addSuffix: true })}</span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {new Date(request.updatedAt).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>

                  {/* Sort column spacer */}
                  <td style={{ width: '80px' }} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </>
  )
}
