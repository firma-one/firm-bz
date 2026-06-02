'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Copy, Download, FileIcon, Paperclip, CheckCircle2, X, Trash2,
  Clock, AlertCircle, Lightbulb, HelpCircle,
} from 'lucide-react'
import { TicketType } from '@prisma/client'
import { useToast } from '@/components/ui/toast'
import { uploadSupportAttachment, type AttachmentMeta } from '@/lib/support-attachment-upload'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { FIRMA_COLOR } from '@/config/brand'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SupportTicketDetailsPaneProps {
  firmSlug: string
  ticket: {
    id: string
    ticketNumber: string
    type: TicketType
    description: string
    attachments?: AttachmentMeta[]
    createdAt: Date
    updatedAt?: Date
    status?: string
    firmId?: string | null
  }
  onStatusUpdate?: (newStatus: string) => void
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

const TYPE_CONFIG: Record<TicketType, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  [TicketType.BUG]:     { label: 'Bug Report',       color: '#f43f5e', bgColor: '#fff1f2', borderColor: '#fda4af', icon: AlertCircle },
  [TicketType.REQUEST]: { label: 'Feature Request',  color: FIRMA_COLOR, bgColor: '#f0faf6', borderColor: '#6ee7c7', icon: Lightbulb   },
  [TicketType.ENQUIRY]: { label: 'General Enquiry',  color: '#5A78FF', bgColor: '#f0f3ff', borderColor: '#a5b4fc', icon: HelpCircle  },
}

const STATUS_OPTIONS = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

export function SupportTicketDetailsPane({
  firmSlug,
  ticket,
  onStatusUpdate,
}: SupportTicketDetailsPaneProps) {
  const [currentStatus, setCurrentStatus] = useState(ticket.status || 'NEW')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [localAttachments, setLocalAttachments] = useState<AttachmentMeta[]>(
    () => (ticket.attachments as AttachmentMeta[]) ?? []
  )
  const [newAttachments, setNewAttachments] = useState<PendingAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const MAX_FILE_SIZE = 50 * 1024 * 1024
  const allAttachments = [
    ...localAttachments,
    ...newAttachments.filter(a => a.status === 'done' && a.meta).map(a => a.meta!),
  ] as AttachmentMeta[]

  const cfg = TYPE_CONFIG[ticket.type]
  const TypeIcon = cfg.icon

  const updateAttachment = (id: string, updates: Partial<PendingAttachment>) =>
    setNewAttachments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))

  const addFiles = (files: File[]) => {
    const items: PendingAttachment[] = files
      .filter(f => {
        if (f.size > MAX_FILE_SIZE) {
          addToast({ title: 'File too large', message: `${f.name} exceeds 50 MB`, type: 'error', duration: 4000 })
          return false
        }
        return true
      })
      .map(f => ({
        id: `attach-${Date.now()}-${Math.random()}`,
        file: f,
        displayName: f.name || `Screenshot at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
        status: 'pending' as const,
        progress: 0,
      }))
    setNewAttachments(prev => [...prev, ...items])
  }

  const handleUpload = async () => {
    const pending = newAttachments.filter(a => a.status === 'pending')
    if (!pending.length) return
    setIsUploading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('No active session'); return }
      const token = session.access_token
      const uploaded: AttachmentMeta[] = []
      for (let i = 0; i < pending.length; i += 3) {
        await Promise.all(pending.slice(i, i + 3).map(async a => {
          updateAttachment(a.id, { status: 'uploading' })
          const res = await uploadSupportAttachment(token, firmSlug, ticket.ticketNumber, a.file, pct => updateAttachment(a.id, { progress: pct }))
          if (res.success && res.meta) { updateAttachment(a.id, { status: 'done', meta: res.meta }); uploaded.push(res.meta) }
          else updateAttachment(a.id, { status: 'error', error: res.error })
        }))
      }
      if (uploaded.length) {
        const attachRes = await fetch(`/api/support/requests/${ticket.ticketNumber}/attachments`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachments: uploaded }),
        })
        if (!attachRes.ok) { setError('Failed to save attachments'); return }
        addToast({ title: 'Attachments added', message: `${uploaded.length} file(s) uploaded.`, type: 'success', duration: 3000 })
      }
      setNewAttachments(prev => prev.filter(a => a.status !== 'pending'))
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteAttachment = async (attachment: AttachmentMeta) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('No active session'); return }
      const res = await fetch(`/api/support/requests/${ticket.ticketNumber}/attachments/${attachment.driveFileId}/delete`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setError('Failed to delete attachment'); return }
      setLocalAttachments(prev => prev.filter(a => a.driveFileId !== attachment.driveFileId))
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    }
  }

  const handleDownload = async (attachment: AttachmentMeta) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const a = window.document.createElement('a')
    a.href = `/api/support/requests/${ticket.ticketNumber}/attachments/${attachment.driveFileId}/download?token=${session.access_token}&filename=${encodeURIComponent(attachment.originalName)}`
    a.download = attachment.originalName
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return
    setIsUpdatingStatus(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`/api/support/requests/${ticket.ticketNumber}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      setCurrentStatus(newStatus)
      onStatusUpdate?.(newStatus)
      addToast({ title: 'Status updated', message: `Changed to ${newStatus.replace(/_/g, ' ')}`, type: 'success', duration: 2000 })
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message || 'Failed to update status', type: 'error', duration: 3000 })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const copyTicketNumber = () => {
    navigator.clipboard.writeText(ticket.ticketNumber)
    addToast({ title: 'Copied', message: 'Ticket ID copied to clipboard', type: 'success', duration: 2000 })
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">

          {/* Meta grid — 70/30 split, values left-aligned */}
          <div className="grid grid-cols-[70%_30%] gap-y-3 items-center">
            {/* Ticket ID */}
            <span className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Ticket ID</span>
            <div className="flex items-center gap-1">
              <code className="font-mono text-xs bg-[#f3f4f6] border border-[#e5e7eb] px-1.5 py-0.5 rounded text-[#1b1b1d] truncate">
                {ticket.ticketNumber}
              </code>
              <button onClick={copyTicketNumber} className="p-0.5 hover:bg-[#f3f4f6] rounded transition-colors shrink-0" title="Copy ticket ID">
                <Copy className="h-3.5 w-3.5 text-[#45474c]" />
              </button>
            </div>

            {/* Type */}
            <span className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Type</span>
            <div
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border w-fit"
              style={{ backgroundColor: cfg.bgColor, borderColor: cfg.borderColor, color: cfg.color }}
            >
              <TypeIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{cfg.label}</span>
            </div>

            {/* Status */}
            <span className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Status</span>
            <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isUpdatingStatus}>
              <SelectTrigger className="h-7 w-full text-xs border-[#e5e7eb]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Created */}
            <span className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Created</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-[#45474c] cursor-help">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{new Date(ticket.createdAt).toLocaleString()}</TooltipContent>
            </Tooltip>

            {/* Modified */}
            {ticket.updatedAt && (
              <>
                <span className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Modified</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-xs text-[#45474c] cursor-help">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">{new Date(ticket.updatedAt).toLocaleString()}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          <div className="border-t border-[#e5e7eb]" />

          {/* Description */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Description</p>
            <div className="bg-[#f9f9fb] border border-[#e5e7eb] rounded p-3 text-[0.8125rem] text-[#1b1b1d] whitespace-pre-wrap break-words leading-relaxed">
              {ticket.description}
            </div>
          </div>

          <div className="border-t border-[#e5e7eb]" />

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold text-[#45474c] uppercase tracking-wider">Attachments</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs text-[#45474c] hover:text-[#1b1b1d] transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Add files
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }}
            />

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) addFiles(f) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded py-5 text-center cursor-pointer transition-colors ${isDragOver ? 'border-primary bg-[#f0faf6]' : 'border-[#e5e7eb] bg-[#f9f9fb] hover:border-[#d1d5db]'}`}
            >
              <Paperclip className="h-4 w-4 text-[#45474c] mx-auto mb-1.5" />
              <p className="text-xs text-[#45474c]">Drop files or click to browse</p>
            </div>

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</p>
            )}

            {/* Existing attachments */}
            {allAttachments.length > 0 && (
              <div className="space-y-1.5">
                {allAttachments.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-[#f9f9fb] border border-[#e5e7eb] rounded">
                    <FileIcon className="h-4 w-4 text-[#45474c] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#1b1b1d] truncate">{a.originalName}</p>
                      {a.size ? (
                        <p className="text-[10px] text-[#45474c]">{(a.size / 1024 / 1024).toFixed(2)} MB</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-[#45474c] hover:text-[#1b1b1d]" title="Download" onClick={() => handleDownload(a)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-[#45474c] hover:text-rose-600" title="Delete" onClick={() => handleDeleteAttachment(a)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending uploads */}
            {newAttachments.some(a => a.status !== 'done') && (
              <div className="space-y-1.5">
                {newAttachments.filter(a => a.status !== 'done').map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-[#f9f9fb] border border-[#e5e7eb] rounded">
                    <FileIcon className="h-4 w-4 text-[#45474c] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#1b1b1d] truncate">{a.displayName}</p>
                      {a.status === 'uploading' && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-1 bg-[#e5e7eb] rounded overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${a.progress}%` }} />
                          </div>
                          <span className="text-[10px] text-[#45474c]">{a.progress}%</span>
                        </div>
                      )}
                      {a.status === 'done' && (
                        <p className="text-[10px] text-primary flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Uploaded</p>
                      )}
                      {a.status === 'error' && (
                        <p className="text-[10px] text-rose-600 mt-1">{a.error}</p>
                      )}
                    </div>
                    {(a.status === 'pending' || a.status === 'error') && (
                      <button type="button" onClick={() => setNewAttachments(prev => prev.filter(x => x.id !== a.id))} className="p-0.5 text-[#45474c] hover:text-rose-600 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {newAttachments.some(a => a.status === 'pending') && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full h-8 text-xs font-medium rounded bg-[#1b1b1d] text-white hover:bg-[#333] disabled:opacity-50 transition-colors"
              >
                {isUploading ? 'Uploading…' : 'Upload Attachments'}
              </button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
