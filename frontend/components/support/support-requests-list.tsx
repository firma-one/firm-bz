'use client'

import React, { useState, useEffect } from 'react'
import { TicketType } from '@prisma/client'
import { AlertCircle, Lightbulb, HelpCircle, MessageCircle, MoreHorizontal, Copy, Check } from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SupportRequestCommentsSidebar } from './support-request-comments-sidebar'

interface SupportRequest {
  id: string
  ticketNumber: string
  type: TicketType
  description: string
  comments?: any[]
  createdAt: Date
  updatedAt: Date
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
  [TicketType.BUG]: { label: 'Bug Report', icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-50' },
  [TicketType.REQUEST]: { label: 'Feature Request', icon: Lightbulb, color: 'text-yellow-500', bgColor: 'bg-yellow-50' },
  [TicketType.ENQUIRY]: { label: 'General Enquiry', icon: HelpCircle, color: 'text-blue-500', bgColor: 'bg-blue-50' },
}

export function SupportRequestsList({ firmSlug }: SupportRequestsListProps) {
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
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

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900">Ticket ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900">Description</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900">Created</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-900">Comments</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const config = TYPE_CONFIG[request.type]
              const Icon = config.icon
              const commentCount = Array.isArray(request.comments) ? request.comments.length : 0

              return (
                <tr key={request.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                  {/* Type */}
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-2 w-fit px-2.5 py-1.5 rounded-lg ${config.bgColor}`}>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                  </td>

                  {/* Ticket ID */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">
                        {request.ticketNumber}
                      </code>
                      <button
                        onClick={() => handleCopyTicketNumber(request.ticketNumber)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                        title="Copy ticket ID"
                      >
                        {copiedTicketId === request.ticketNumber ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3">
                    <p className="text-slate-700 line-clamp-2">{request.description}</p>
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-slate-600">
                    {formatDistanceToNow(request.createdAt, { addSuffix: true })}
                  </td>

                  {/* Comments Count */}
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                      {commentCount}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedRequestId(request.id)
                            setIsSidebarOpen(true)
                          }}
                          className="cursor-pointer"
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Comments ({commentCount})
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
    </>
  )
}
