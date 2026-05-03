'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { TicketType } from '@prisma/client'
import { AlertCircle, Lightbulb, HelpCircle, MessageCircle, Copy, Check, Eye, Clock, ChevronDown, RefreshCw, Search, X } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SupportRequestCommentsSidebar } from './support-request-comments-sidebar'
import { ViewSupportRequestModal } from './view-support-request-modal'

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
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
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

  const selectedRequest = requests.find(r => r.id === selectedRequestId)

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
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
          <HelpCircle className="h-6 w-6 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No requests yet</h3>
        <p className="text-slate-500 text-sm mt-1">Create your first support request to get started.</p>
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
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors",
                  filterTypes.length > 0 && "border-slate-400 ring-1 ring-slate-300"
                )}
              >
                Type
                {filterTypes.length > 0 && (
                  <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">
                    {filterTypes.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Type</DropdownMenuLabel>
                {filterTypes.length > 0 && (
                  <button
                    className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 px-2 py-1"
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
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors",
                  filterStatuses.length > 0 && "border-slate-400 ring-1 ring-slate-300"
                )}
              >
                Status
                {filterStatuses.length > 0 && (
                  <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">
                    {filterStatuses.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[190px] py-1 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Status</DropdownMenuLabel>
                {filterStatuses.length > 0 && (
                  <button
                    className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 px-2 py-1"
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-500"
                onClick={closeSearch}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openSearch}
                    className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Search tickets</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRefreshing}
                  onClick={() => fetchRequests(true)}
                  className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Refresh list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '110px' }}>Type</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '130px' }}>Ticket ID</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-900 text-xs" style={{ width: '70px' }}>Actions</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs">Description</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '110px' }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '120px' }}>Created</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '120px' }}>Modified</th>
              {/* Sort in header */}
              <th className="px-3 py-2 text-right" style={{ width: '80px' }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 -mr-1">
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z" />
                      </svg>
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] py-1 text-xs">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400">Sort by</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortField === 'createdAt'} onCheckedChange={() => setSortField('createdAt')}>
                      Created
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem className="text-xs" checked={sortField === 'updatedAt'} onCheckedChange={() => setSortField('updatedAt')}>
                      Modified
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400">Direction</DropdownMenuLabel>
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
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-xs text-slate-400">
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

              return (
                <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  {/* Type */}
                  <td className="px-3 py-2" style={{ width: '110px' }}>
                    <div className={`flex items-center gap-1 w-fit px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="whitespace-nowrap">{config.label}</span>
                    </div>
                  </td>

                  {/* Ticket ID */}
                  <td className="px-3 py-2" style={{ width: '130px' }}>
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
                              onClick={() => { setSelectedRequestId(request.id); setDetailsOpen(true) }}
                              className="p-1 hover:bg-slate-200 rounded transition-colors"
                            >
                              <Eye className="h-4 w-4 text-slate-600" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">View Details</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => { setSelectedRequestId(request.id); setIsSidebarOpen(true) }}
                              className="p-1 hover:bg-slate-200 rounded transition-colors"
                            >
                              <MessageCircle className="h-4 w-4 text-slate-600" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">Comments ({commentCount})</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-3 py-2 min-w-0">
                    <p className="text-slate-700 truncate text-xs" title={request.description}>{request.description}</p>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2" style={{ width: '110px' }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${statusColor}`}>
                      {(request.status || 'NEW').replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-3 py-2" style={{ width: '120px' }}>
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
                  <td className="px-3 py-2" style={{ width: '120px' }}>
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

      {/* Comments Sidebar */}
      {selectedRequest && (
        <SupportRequestCommentsSidebar
          request={selectedRequest}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onCommentsUpdate={(updatedComments) => {
            setRequests(requests.map(r =>
              r.id === selectedRequest.id ? { ...r, comments: updatedComments } : r
            ))
          }}
        />
      )}

      {/* View Details Modal */}
      {selectedRequest && (
        <ViewSupportRequestModal
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          firmSlug={firmSlug}
          ticket={selectedRequest}
        />
      )}
    </>
  )
}
