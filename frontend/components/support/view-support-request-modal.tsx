'use client'

import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Copy, ExternalLink, Download, FileIcon, Paperclip, CheckCircle2, X } from "lucide-react"
import { TicketType } from '@prisma/client'
import { useToast } from "@/components/ui/toast"
import { uploadSupportAttachment, type AttachmentMeta } from '@/lib/support-attachment-upload'
import { supabase } from '@/lib/supabase'

interface ViewSupportRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  firmSlug: string
  ticket: {
    id: string
    ticketNumber: string
    type: TicketType
    description: string
    attachments?: AttachmentMeta[]
    createdAt: Date
    status?: string
  }
}

type PendingAttachment = {
  id: string
  file: File
  displayName: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  meta?: AttachmentMeta
  error?: string
}

const REQUEST_TYPE_LABELS: Record<TicketType, string> = {
  [TicketType.BUG]: 'Bug Report',
  [TicketType.REQUEST]: 'Feature Request',
  [TicketType.ENQUIRY]: 'General Enquiry',
}

const REQUEST_TYPE_COLORS: Record<TicketType, string> = {
  [TicketType.BUG]: 'bg-red-100 text-red-800',
  [TicketType.REQUEST]: 'bg-blue-100 text-blue-800',
  [TicketType.ENQUIRY]: 'bg-amber-100 text-amber-800',
}

export function ViewSupportRequestModal({
  open,
  onOpenChange,
  firmSlug,
  ticket,
}: ViewSupportRequestModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [newAttachments, setNewAttachments] = useState<PendingAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
  const allAttachments = [
    ...(ticket.attachments ?? []),
    ...newAttachments.filter(a => a.status === 'done' && a.meta),
  ] as (AttachmentMeta & { isNew?: boolean })[]

  const updateAttachment = (id: string, updates: Partial<PendingAttachment>) => {
    setNewAttachments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const addFiles = (files: File[]) => {
    const newItems: PendingAttachment[] = files
      .filter(f => {
        if (newAttachments.some(a => a.file.name === f.name && a.file.size === f.size)) {
          return false
        }
        if (f.size > MAX_FILE_SIZE) {
          addToast({
            title: 'File too large',
            message: `${f.name} exceeds the 50 MB limit`,
            type: 'error',
            duration: 4000,
          })
          return false
        }
        return true
      })
      .map(f => ({
        id: `attach-${Date.now()}-${Math.random()}`,
        file: f,
        displayName: f.name || `Screenshot at ${new Date().toLocaleTimeString()}`,
        status: 'pending' as const,
        progress: 0,
      }))
    setNewAttachments(prev => [...prev, ...newItems])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFiles(files)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter(i => i.type.startsWith('image/'))
      .map(i => {
        const f = i.getAsFile()
        if (!f) return null
        const ext = i.type.split('/')[1] ?? 'png'
        return new File([f], `screenshot-${Date.now()}.${ext}`, { type: i.type })
      })
      .filter(Boolean) as File[]
    if (imageFiles.length > 0) addFiles(imageFiles)
  }

  const uploadNewAttachments = async (session: any) => {
    const pendingUploads = newAttachments.filter(a => a.status === 'pending')
    if (pendingUploads.length === 0) return []

    const uploadedMeta: AttachmentMeta[] = []
    const token = session?.access_token

    if (!token) {
      console.warn('No session token for uploads')
      return []
    }

    // Upload in batches of 3 concurrently
    const batchSize = 3
    for (let i = 0; i < pendingUploads.length; i += batchSize) {
      const batch = pendingUploads.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (a) => {
          updateAttachment(a.id, { status: 'uploading' })
          const result = await uploadSupportAttachment(
            token,
            firmSlug,
            ticket.ticketNumber,
            a.file,
            (pct) => updateAttachment(a.id, { progress: pct })
          )
          if (result.success && result.meta) {
            updateAttachment(a.id, { status: 'done', meta: result.meta })
            uploadedMeta.push(result.meta)
          } else {
            updateAttachment(a.id, { status: 'error', error: result.error })
          }
        })
      )
    }

    return uploadedMeta
  }

  const handleAddAttachments = async () => {
    if (newAttachments.filter(a => a.status === 'pending').length === 0) return

    setIsLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setError('No active session')
        setIsLoading(false)
        return
      }

      const uploadedMeta = await uploadNewAttachments(session)

      if (uploadedMeta.length > 0) {
        // Persist attachment metadata to ticket
        const attachRes = await fetch(
          `/api/support/requests/${ticket.ticketNumber}/attachments`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ attachments: uploadedMeta }),
          }
        )

        if (!attachRes.ok) {
          setError('Failed to save attachments')
          return
        }
      }

      addToast({
        title: 'Attachments added',
        message: `${uploadedMeta.length} file(s) uploaded successfully.`,
        type: 'success',
        duration: 4000,
      })

      setNewAttachments(prev => prev.filter(a => a.status !== 'pending'))
    } catch (err: any) {
      console.error('Failed to add attachments:', err)
      setError(err.message || 'Failed to add attachments')
    } finally {
      setIsLoading(false)
    }
  }

  const isImage = (mimeType?: string) => mimeType?.startsWith('image/') ?? false

  const getGoogleDriveViewUrl = (driveFileId: string) => {
    return `https://drive.google.com/file/d/${driveFileId}/view`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast({
      title: 'Copied',
      message: 'Ticket ID copied to clipboard',
      type: 'success',
      duration: 2000,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] border-slate-200 max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Support Request Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ticket Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Ticket ID</span>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-900">
                  {ticket.ticketNumber}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-slate-500 hover:text-slate-900"
                  onClick={() => copyToClipboard(ticket.ticketNumber)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Type</span>
              <Badge className={`${REQUEST_TYPE_COLORS[ticket.type]}`}>
                {REQUEST_TYPE_LABELS[ticket.type]}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Created</span>
              <span className="text-sm text-slate-900">
                {new Date(ticket.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-200" />

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-slate-900">Description</Label>
            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-slate-900 text-sm whitespace-pre-wrap">
              {ticket.description}
            </div>
          </div>

          {/* Attachments Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-900">Attachments</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-slate-600 hover:text-slate-900"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Paperclip className="h-4 w-4 mr-1" />
                Add files
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(Array.from(e.target.files))
                }
                e.target.value = ''
              }}
            />

            {/* Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onPaste={handlePaste}
              className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
                isDragOver ? 'border-slate-400 bg-slate-50' : 'border-slate-300 bg-slate-100'
              }`}
            >
              <Paperclip className="h-5 w-5 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600">
                Drop files here, click above to browse, or paste a screenshot
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            {/* Existing + Pending Attachments */}
            {allAttachments.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allAttachments.map((a, idx) => (
                  <div key={idx} className="space-y-2">
                    {isImage(a.mimeType) ? (
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <img
                          src={getGoogleDriveViewUrl(a.driveFileId)}
                          alt={a.originalName}
                          className="w-full max-h-48 object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        <div className="p-2 bg-slate-50 flex items-center justify-between">
                          <span className="text-sm text-slate-900 truncate">{a.originalName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1 text-slate-500 hover:text-slate-900"
                            asChild
                          >
                            <a href={getGoogleDriveViewUrl(a.driveFileId)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                        <FileIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 truncate">{a.originalName}</p>
                          <p className="text-xs text-slate-500">
                            {(a.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-slate-500 hover:text-slate-900"
                          asChild
                        >
                          <a href={getGoogleDriveViewUrl(a.driveFileId)} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pending/Uploading Attachments */}
            {newAttachments.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {newAttachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200"
                  >
                    <FileIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 truncate">{a.displayName}</p>
                      {a.status === 'uploading' && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-slate-300 rounded overflow-hidden">
                            <div
                              className="h-full bg-slate-600 transition-all"
                              style={{ width: `${a.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{a.progress}%</span>
                        </div>
                      )}
                      {a.status === 'done' && (
                        <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                          <CheckCircle2 className="h-3 w-3" /> Uploaded
                        </p>
                      )}
                      {a.status === 'error' && (
                        <p className="text-xs text-red-600 mt-1">{a.error}</p>
                      )}
                    </div>
                    {(a.status === 'pending' || a.status === 'error') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 text-slate-500 hover:text-red-600"
                        onClick={() => setNewAttachments(prev => prev.filter(att => att.id !== a.id))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add Button */}
            {newAttachments.some(a => a.status === 'pending') && (
              <Button
                type="button"
                className="w-full"
                variant="blackCta"
                onClick={handleAddAttachments}
                disabled={isLoading || !newAttachments.some(a => a.status === 'pending')}
              >
                {isLoading ? 'Adding...' : 'Add Attachments'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
