'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, MessagesSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface Comment {
  id: string
  content: string
  createdAt: string
  createdBy: string
  authorEmail: string
  authorName?: string
}

interface SupportRequest {
  id: string
  ticketNumber: string
  description: string
  comments?: any[]
}

interface SupportRequestCommentsSidebarProps {
  request: SupportRequest
  isOpen: boolean
  onClose: () => void
  onCommentsUpdate: (comments: any[]) => void
}

function getInitials(name?: string, email?: string): string {
  if (name && name !== 'Current User') {
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  }
  if (email) return email[0].toUpperCase()
  return '?'
}

function getAvatarColor(seed: string): string {
  const colors = [
    'bg-violet-100 text-violet-600',
    'bg-sky-100 text-sky-600',
    'bg-emerald-100 text-emerald-600',
    'bg-amber-100 text-amber-600',
    'bg-rose-100 text-rose-600',
    'bg-indigo-100 text-indigo-600',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const TRANSITION_MS = 280

export function SupportRequestCommentsSidebar({
  request,
  isOpen,
  onClose,
  onCommentsUpdate,
}: SupportRequestCommentsSidebarProps) {
  const [commentText, setCommentText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [comments, setComments] = useState<Comment[]>(
    Array.isArray(request.comments) ? request.comments : []
  )
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setClosing(false)
      const t = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
      return () => cancelAnimationFrame(t)
    }
  }, [isOpen])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setEntered(false)
    setTimeout(() => onClose(), TRANSITION_MS)
  }

  useEffect(() => {
    if (comments.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comments.length])

  const submitComment = async () => {
    if (!commentText.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(
        `/api/support/requests/${request.ticketNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: commentText.trim() }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const { comments: updated } = await res.json()
      setComments(updated)
      onCommentsUpdate(updated)
      setCommentText('')
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submitComment()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentText.trim()) {
      e.preventDefault()
      submitComment()
    }
  }

  if (!isOpen && !closing) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/20 transition-opacity',
          entered && !closing ? 'opacity-100' : 'opacity-0'
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed right-4 top-4 bottom-4 z-50 flex flex-col',
          'w-[380px] bg-white rounded-2xl border border-slate-200/80',
          'shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden',
          'transition-all ease-out'
        )}
        style={{
          transform: entered && !closing ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-2 px-4 border-b border-slate-200/60 bg-white shrink-0 rounded-t-2xl" style={{ height: 52 }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <MessagesSquare className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 truncate">Comments</h2>
            {comments.length > 0 && (
              <span className="text-xs text-slate-400 font-normal shrink-0">({comments.length})</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Comments list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <MessagesSquare className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">No comments yet</p>
              <p className="text-xs text-slate-400 mt-1">Be the first to add a note</p>
            </div>
          ) : (
            comments.map((comment) => {
              const label = comment.authorName || comment.authorEmail
              const initials = getInitials(comment.authorName, comment.authorEmail)
              const avatarColor = getAvatarColor(comment.authorEmail)
              return (
                <div key={comment.id} className="flex gap-3">
                  <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5', avatarColor)}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-800 truncate">{label}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200/60 px-4 py-3 bg-slate-50/50 shrink-0 rounded-b-2xl">
          <form onSubmit={handleAddComment}>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment… (⌘↵ to post)"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-none transition-colors"
              disabled={isSubmitting}
            />
            <div className="flex justify-end mt-2">
              <Button
                type="submit"
                disabled={!commentText.trim() || isSubmitting}
                variant="blackCta"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
