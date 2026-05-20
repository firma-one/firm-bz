'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, Lightbulb, HelpCircle, Paperclip, FileIcon, CheckCircle2, X, LifeBuoy, Loader2 } from "lucide-react"
import { TicketType } from '@prisma/client'
import { submitErrorTicket } from '@/app/actions/submit-ticket'
import { useToast } from "@/components/ui/toast"
import { uploadSupportAttachment, type AttachmentMeta } from '@/lib/support-attachment-upload'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

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
    icon: AlertCircle,
    color: '#f43f5e',
    activeBgColor: '#fff1f2',
    activeBorderColor: '#fda4af',
  },
  {
    id: TicketType.REQUEST,
    label: 'Feature Request',
    icon: Lightbulb,
    color: '#069668',
    activeBgColor: '#f0faf6',
    activeBorderColor: '#6ee7c7',
  },
  {
    id: TicketType.ENQUIRY,
    label: 'General Enquiry',
    icon: HelpCircle,
    color: '#5A78FF',
    activeBgColor: '#f0f3ff',
    activeBorderColor: '#a5b4fc',
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

  const MAX_FILE_SIZE = 50 * 1024 * 1024

  const updateAttachment = (id: string, updates: Partial<PendingAttachment>) => {
    setAttachments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const addFiles = (files: File[]) => {
    const newItems: PendingAttachment[] = files
      .filter(f => {
        if (attachments.some(a => a.file.name === f.name && a.file.size === f.size)) return false
        if (f.size > MAX_FILE_SIZE) {
          addToast({ title: 'File too large', message: `${f.name} exceeds the 50 MB limit`, type: 'error', duration: 4000 })
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
    if (!token) return []

    const batchSize = 3
    for (let i = 0; i < attachments.length; i += batchSize) {
      const batch = attachments.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (a) => {
          updateAttachment(a.id, { status: 'uploading' })
          const result = await uploadSupportAttachment(token, firmSlug, ticketNumber, a.file, (pct) => updateAttachment(a.id, { progress: pct }))
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!description.trim()) return
    setIsLoading(true)
    setError(null)

    try {
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

      if (attachments.length > 0) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const uploadedMeta = await uploadAttachments(result.ticketNumber, session)
          if (uploadedMeta.length > 0) {
            await fetch(`/api/support/requests/${result.ticketNumber}/attachments`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ attachments: uploadedMeta }),
            })
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
        message: "Thank you for reaching out. We've received your request and will review it shortly.",
        type: 'success',
        duration: 5000,
      })
      window.dispatchEvent(new CustomEvent('support-requests-updated'))
      router.refresh()
    } catch (err: any) {
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

  const selectedTypeInfo = REQUEST_TYPES.find(t => t.id === selectedType)!

  return (
    <>
      {wrapTrigger(trigger || (
        <button
          type="button"
          className="h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all inline-flex items-center gap-1.5"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          New Request
        </button>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 border-[#e5e7eb] !rounded-[2px] overflow-hidden max-h-[90vh] flex flex-col gap-0">

          {/* Modal header */}
          <div className="border-b border-[#e5e7eb] px-6 py-5 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-[#f3f4f6] border border-[#e5e7eb] rounded flex items-center justify-center shrink-0">
                <LifeBuoy className="h-4 w-4 text-[#1b1b1d]" />
              </div>
              <h2 className="font-headline text-lg font-bold tracking-tight text-[#1b1b1d]">
                New Support Request
              </h2>
            </div>
            <p className="text-[0.8125rem] text-[#45474c] pl-11">
              Report issues, request features, or ask questions. We&apos;ll review and get back to you.
            </p>
          </div>

          {/* Form body */}
          <form
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            className="flex flex-col flex-1 min-h-0 overflow-y-auto"
          >
            <div className="px-6 py-5 space-y-5">

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  {error}
                </div>
              )}

              {/* Request type — visual card picker */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-[#45474c] uppercase tracking-wider">
                  Request Type <span className="text-rose-400">*</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {REQUEST_TYPES.map(type => {
                    const Icon = type.icon
                    const isActive = selectedType === type.id
                    return (
                      <button
                        key={type.id}
                        type="button"
                        disabled={isLoading}
                        onClick={() => setSelectedType(type.id)}
                        className="flex flex-col items-center gap-2 px-2 py-4 rounded-[2px] border text-center transition-all"
                        style={isActive ? {
                          backgroundColor: type.activeBgColor,
                          borderColor: type.activeBorderColor,
                        } : {
                          backgroundColor: '#ffffff',
                          borderColor: '#e5e7eb',
                        }}
                      >
                        <Icon
                          className="h-5 w-5 transition-all"
                          style={{ color: type.color, opacity: isActive ? 1 : 0.45 }}
                        />
                        <span
                          className="text-[0.8125rem] leading-tight"
                          style={{ fontWeight: isActive ? 600 : 400, color: isActive ? '#1b1b1d' : '#45474c' }}
                        >
                          {type.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium text-[#45474c] uppercase tracking-wider">
                  Description <span className="text-rose-400">*</span>
                </Label>
                <p className="text-[0.8125rem] text-[#45474c]">
                  {selectedTypeInfo.label} — Provide as much detail as possible to help us assist you better.
                </p>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={placeholders[selectedType]}
                  className="border-[#e5e7eb] rounded-[2px] text-[0.8125rem] text-[#1b1b1d] placeholder:text-[#45474c]/50 focus:border-primary focus:ring-primary/20 disabled:opacity-60 min-h-32 resize-none"
                  disabled={isLoading}
                  required
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-[#45474c] uppercase tracking-wider">
                    Attachments
                    <span className="ml-1 font-normal normal-case tracking-normal text-[#45474c]/60">(optional)</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1 text-[0.8125rem] text-primary hover:text-[#047a55] font-medium transition-colors disabled:opacity-50"
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
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files))
                    e.target.value = ''
                  }}
                />
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "border border-dashed rounded-[2px] px-4 py-5 text-center transition-colors cursor-pointer",
                    isDragOver
                      ? "border-primary bg-[#f0faf6]"
                      : "border-[#d1d5db] bg-[#f9f9fb] hover:border-primary/50 hover:bg-[#f9f9fb]"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 text-[#45474c]/50 mx-auto mb-1.5" />
                  <p className="text-[0.8125rem] text-[#45474c]">
                    Drop files here, click to browse, or paste a screenshot
                  </p>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 px-3 py-2 bg-[#f9f9fb] rounded border border-[#e5e7eb]"
                      >
                        <FileIcon className="h-3.5 w-3.5 text-[#45474c] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[0.8125rem] text-[#1b1b1d] truncate font-medium">{a.displayName}</p>
                          {a.status === 'uploading' && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-0.5 bg-[#e5e7eb] rounded overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${a.progress}%` }} />
                              </div>
                              <span className="text-[10px] text-[#45474c] tabular-nums">{a.progress}%</span>
                            </div>
                          )}
                          {a.status === 'done' && (
                            <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5 font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Uploaded
                            </p>
                          )}
                          {a.status === 'error' && (
                            <p className="text-[10px] text-rose-600 mt-0.5">{a.error}</p>
                          )}
                        </div>
                        {(a.status === 'pending' || a.status === 'error') && (
                          <button
                            type="button"
                            onClick={() => setAttachments(prev => prev.filter(att => att.id !== a.id))}
                            className="p-0.5 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-rose-600 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-2 bg-[#f9f9fb]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isLoading}
                className="px-4 py-2 text-[0.8125rem] font-medium text-[#45474c] bg-white border border-[#e5e7eb] rounded-[2px] hover:bg-[#f3f4f6] hover:text-[#1b1b1d] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!description.trim() || isLoading}
                className="group inline-flex items-center gap-2 px-4 py-2 rounded-[2px] bg-[#1a5c3a] hover:bg-[#164f32] text-white text-xs font-headline font-bold tracking-widest uppercase transition-all shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <LifeBuoy className="h-3.5 w-3.5" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
