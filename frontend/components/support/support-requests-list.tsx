'use client'

import React, { useState, useEffect } from 'react'
import { TicketType } from '@prisma/client'
import { AlertCircle, Lightbulb, HelpCircle, MessageCircle, Copy, Check, Eye, Clock } from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  firm?: {
    name: string
    slug: string
  }
  client?: {
    name: string
    slug: string
  }
  engagement?: {
    name: string
    slug: string
  }
}

interface SupportRequestsListProps {
  firmSlug: string
}

const TYPE_CONFIG = {
  [TicketType.BUG]: { label: 'Bug Report', icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-50' },
  [TicketType.REQUEST]: { label: 'Feature Request', icon: Lightbulb, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  [TicketType.ENQUIRY]: { label: 'General Enquiry', icon: HelpCircle, color: 'text-blue-600', bgColor: 'bg-blue-50' },
}

export function SupportRequestsList({ firmSlug }: SupportRequestsListProps) {
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null)

  const selectedRequest = requests.find(r => r.id === selectedRequestId)

  const handleCopyTicketNumber = async (ticketNumber: string) => {
    await navigator.clipboard.writeText(ticketNumber)
    setCopiedTicketId(ticketNumber)
    setTimeout(() => setCopiedTicketId(null), 2000)
  }

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/support/requests?firmSlug=${firmSlug}`)
        if (response.ok) {
          const data = await response.json()
          setRequests(data.map((r: any) => ({
            ...r,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          })))
        }
      } catch (error) {
        console.error('Failed to fetch support requests:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRequests()
  }, [firmSlug])

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

  const STATUS_COLORS: Record<string, string> = {
    NEW: 'bg-blue-50 text-blue-600 border-blue-200',
    IN_PROGRESS: 'bg-amber-50 text-amber-600 border-amber-200',
    RESOLVED: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
  }

  return (
    <>
      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '110px' }}>Type</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '130px' }}>Ticket ID</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs">Description</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '80px' }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '120px' }}>Created</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900 text-xs" style={{ width: '120px' }}>Modified</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-900 text-xs" style={{ width: '80px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
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

                  {/* Description */}
                  <td className="px-3 py-2 min-w-0">
                    <p className="text-slate-700 truncate text-xs" title={request.description}>{request.description}</p>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2" style={{ width: '80px' }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusColor}`}>
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
                    {request.updatedAt && request.updatedAt !== request.createdAt ? (
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

                  {/* Actions */}
                  <td className="px-3 py-2 text-center" style={{ width: '80px' }}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedRequestId(request.id)
                          setDetailsOpen(true)
                        }}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4 text-slate-600" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRequestId(request.id)
                          setIsSidebarOpen(true)
                        }}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title={`Comments (${commentCount})`}
                      >
                        <MessageCircle className="h-4 w-4 text-slate-600" />
                      </button>
                    </div>
                  </td>
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
