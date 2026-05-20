'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RelativeDateTime } from '@/components/ui/relative-date-time'

interface Comment {
  id: string
  content: string
  createdAt: string
  createdBy: string
  authorEmail: string
  authorName?: string | null
}

interface SupportTicketCommentsPaneProps {
  ticketNumber: string
  initialComments: Comment[]
  onCommentsUpdate?: (comments: Comment[]) => void
}

export function SupportTicketCommentsPane({
  ticketNumber,
  initialComments,
  onCommentsUpdate,
}: SupportTicketCommentsPaneProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [commentText, setCommentText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Sync if parent refreshes the ticket data
  useEffect(() => {
    setComments(initialComments)
  }, [ticketNumber])

  useEffect(() => {
    if (comments.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comments.length])

  const submitComment = async () => {
    const trimmed = commentText.trim()
    if (!trimmed || isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await fetch(
        `/api/support/requests/${ticketNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const { comments: updated } = await res.json()
      setComments(updated)
      onCommentsUpdate?.(updated)
      setCommentText('')
    } catch (err) {
      console.error('Failed to add comment:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submitComment()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Comments list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center select-none">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No comments yet</p>
            <p className="text-xs text-slate-400 mt-1">Be the first to add a note</p>
          </div>
        ) : (
          comments.map((comment, idx) => {
            const isLatest = idx === comments.length - 1
            const label = comment.authorName || comment.authorEmail
            return (
              <div
                key={comment.id}
                className="group rounded border border-slate-200 bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-slate-700 truncate">{label}</span>
                  <RelativeDateTime
                    date={comment.createdAt}
                    className="text-xs text-slate-400 shrink-0"
                  />
                  {isLatest && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                      Latest
                    </span>
                  )}
                </div>
                <p className="text-slate-900 whitespace-pre-wrap break-words leading-relaxed">
                  {comment.content}
                </p>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200/60 px-4 py-3 bg-slate-50/50 shrink-0">
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment… (⌘↵ to post)"
          rows={3}
          className="w-full px-3 py-2.5 rounded border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-none transition-colors"
          disabled={isSubmitting}
        />
        <div className="flex justify-end mt-2">
          <Button
            type="button"
            onClick={submitComment}
            disabled={!commentText.trim() || isSubmitting}
            variant="blackCta"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {isSubmitting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </div>
  )
}
