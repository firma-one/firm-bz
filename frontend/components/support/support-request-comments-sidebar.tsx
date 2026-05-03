'use client'

import React, { useState } from 'react'
import { X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'

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
  description: string
  comments?: any[]
}

interface SupportRequestCommentsSidebarProps {
  request: SupportRequest
  isOpen: boolean
  onClose: () => void
  onCommentsUpdate: (comments: any[]) => void
}

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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    setIsSubmitting(true)
    try {
      const newComment: Comment = {
        id: `${Date.now()}`,
        content: commentText,
        createdAt: new Date().toISOString(),
        createdBy: 'current-user', // TODO: Get from auth context
        authorEmail: 'user@example.com', // TODO: Get from auth context
        authorName: 'Current User', // TODO: Get from auth context
      }

      const updatedComments = [...comments, newComment]
      setComments(updatedComments)
      onCommentsUpdate(updatedComments)

      // TODO: Persist to database
      // await fetch(`/api/support/requests/${request.id}/comments`, {
      //   method: 'POST',
      //   body: JSON.stringify(newComment)
      // })

      setCommentText('')
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-200 shadow-lg z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Comments</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-4">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                <span className="text-xl">💬</span>
              </div>
              <p className="text-sm text-slate-500">No comments yet</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-slate-900">
                    {comment.authorName || comment.authorEmail}
                  </p>
                  <span className="text-xs text-slate-500">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Comment Input */}
        <div className="border-t border-slate-200 px-6 py-4 space-y-3">
          <form onSubmit={handleAddComment} className="space-y-3">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full h-24 p-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isSubmitting}
            />
            <Button
              type="submit"
              disabled={!commentText.trim() || isSubmitting}
              className="w-full flex items-center justify-center gap-2"
              variant="blackCta"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? 'Posting...' : 'Post Comment'}
            </Button>
          </form>
        </div>
      </div>
    </>
  )
}
