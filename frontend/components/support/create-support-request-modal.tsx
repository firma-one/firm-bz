'use client'

import React, { useState } from 'react'
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
import { SquarePlus, AlertCircle, Lightbulb, HelpCircle } from "lucide-react"
import { TicketType } from '@prisma/client'
import { submitErrorTicket } from '@/app/actions/submit-ticket'
import { useToast } from "@/components/ui/toast"

interface CreateSupportRequestModalProps {
  firmSlug: string
  trigger?: React.ReactNode
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
  const router = useRouter()
  const { addToast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
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

      if (result.success) {
        setOpen(false)
        setDescription('')
        setSelectedType(TicketType.BUG)
        setError(null)

        addToast({
          title: 'Request submitted',
          message: 'Thank you for reaching out. We\'ve received your request and will review it shortly.',
          type: 'success',
          duration: 5000,
        })

        router.refresh()
      } else {
        setError(result.message)
      }
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
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
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
