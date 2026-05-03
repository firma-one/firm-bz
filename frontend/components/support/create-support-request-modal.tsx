'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SquarePlus, AlertCircle, Lightbulb, HelpCircle, Paperclip, FileIcon, CheckCircle2, X } from "lucide-react"
import { TicketType } from '@prisma/client'
import { submitErrorTicket } from '@/app/actions/submit-ticket'
import { useToast } from "@/components/ui/toast"
import { uploadSupportAttachment, type AttachmentMeta } from '@/lib/support-attachment-upload'
import { supabase } from '@/lib/supabase'

interface CreateSupportRequestModalProps {
  firmSlug: string
  trigger?: React.ReactNode
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

const REQUEST_TYPES = [
  {
    id: TicketType.BUG,
    label: 'Bug Report',
    description: 'Report an issue or unexpected behavior',
    icon: AlertCircle,
  },
  {
    id: TicketType.REQUEST,
    label: 'Feature Request',
    description: 'Suggest a new feature or improvement',
    icon: Lightbulb,
  },
  {
    id: TicketType.ENQUIRY,
    label: 'General Enquiry',
    description: 'Ask a question or seek assistance',
    icon: HelpCircle,
  },
]

const placeholders: Record<string, string> = {
  [TicketType.BUG]: 'E.g., When I click the Save button in the Files tab, nothing happens...',
  [TicketType.REQUEST]: 'E.g., It would be helpful if we could bulk export documents as PDFs...',
  [TicketType.ENQUIRY]: 'E.g., How do I share files with external collaborators?',
}

export function CreateSupportRequestModal({ firmSlug, trigger }: CreateSupportRequestModalProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedType, setSelectedType] = useState<TicketType>(TicketType.BUG)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { addToast } = useToast()

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

  const updateAttachment = (id: string, updates: Partial<PendingAttachment>) => {
    setAttachments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const addFiles = (files: File[]) => {
    const newItems: PendingAttachment[] = files
      .filter(f => {
        if (attachments.some(a => a.file.name === f.name && a.file.size === f.size)) {
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
    setAttachments(prev => [...prev, ...newItems])
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

  const uploadAttachments = async (ticketNumber: string, session: any) => {
    if (attachments.length === 0) return []

    const uploadedMeta: AttachmentMeta[] = []
    const token = session?.access_token

    if (!token) {
      console.warn('No session token for uploads')
      return []
    }

    // Upload in batches of 3 concurrently
    const batchSize = 3
    for (let i = 0; i < attachments.length; i += batchSize) {
      const batch = attachments.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (a) => {
          updateAttachment(a.id, { status: 'uploading' })
          const result = await uploadSupportAttachment(
            token,
            firmSlug,
            ticketNumber,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      // Phase 1: Create ticket to get ticketNumber
      const result = await submitErrorTicket({
        description: description.trim(),
        type: selectedType,
        firmSlug,
        metadata: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          screen: typeof window !== 'undefined' ? { width: window.screen.width, height: window.screen.height } : undefined,
        },
      })

      if (!result.success || !result.ticketNumber) {
        setError(result.message)
        setIsLoading(false)
        return
      }

      // Phase 2: Upload attachments if any
      if (attachments.length > 0) {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.access_token) {
          const uploadedMeta = await uploadAttachments(result.ticketNumber, session)

          if (uploadedMeta.length > 0) {
            // Persist attachment metadata to ticket
            const attachRes = await fetch(
              `/api/support/requests/${result.ticketNumber}/attachments`,
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
              console.warn('Failed to persist attachment metadata to ticket')
            }
          }
        }
      }

      setOpen(false)
      setDescription('')
      setSelectedType(TicketType.BUG)
      setAttachments([])
      setError(null)

      addToast({
        title: 'Request submitted',
        message: 'Thank you for reaching out. We\'ve received your request and will review it shortly.',
        type: 'success',
        duration: 5000,
      })

      router.refresh()
    } catch (err: any) {
      console.error('Failed to submit request:', err)
      setError(err.message || 'Failed to submit request')
    } finally {
      setIsLoading(false)
    }
  }

  const wrapTrigger = (node: React.ReactNode): React.ReactNode => {
    if (!React.isValidElement(node)) return node
    const el = node as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
    return React.cloneElement(el, {
      onClick: (e: React.MouseEvent) => {
        el.props.onClick?.(e)
        if (e.defaultPrevented) return
        setOpen(true)
      },
    })
  }

  const selectedTypeInfo = REQUEST_TYPES.find(t => t.id === selectedType)

  return (
    <>
      {wrapTrigger(
        trigger || (
          <Button
            variant="blackCta"
            type="button"
            className="gap-2"
          >
            <SquarePlus className="h-4 w-4" />
            New Request
          </Button>
        ),
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px] border-slate-200 max-h-[90vh] overflow-y-auto p-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Create Support Request</DialogTitle>
            <DialogDescription className="text-slate-600">
              Report issues, request features, or ask questions. We&apos;ll review your request and get back to you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} onPaste={handlePaste} className="space-y-4 pt-4">
            {error && (
              <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-900">
                Request Type <span className="text-slate-500">*</span>
              </Label>
              <Select value={selectedType} onValueChange={(value) => setSelectedType(value as TicketType)} disabled={isLoading}>
                <SelectTrigger className="border-slate-200 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                  <SelectValue placeholder="Select request type" />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map(type => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-900">
                Description <span className="text-slate-500">*</span>
              </Label>
              <p className="text-xs text-slate-500">
                {selectedTypeInfo?.label} — Provide as much detail as possible to help us assist you better.
              </p>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={placeholders[selectedType]}
                className="border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 min-h-32"
                disabled={isLoading}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900">Attachments (optional)</Label>
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
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
                  isDragOver ? 'border-slate-400 bg-slate-50' : 'border-slate-300 bg-slate-100'
                }`}
              >
                <Paperclip className="h-5 w-5 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">
                  Drop files here, click above to browse, or paste a screenshot
                </p>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {attachments.map((a) => (
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
                          onClick={() => setAttachments(prev => prev.filter(att => att.id !== a.id))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="blackCta"
                disabled={!description.trim() || isLoading}
              >
                {isLoading ? 'Submitting...' : 'Submit Request'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
