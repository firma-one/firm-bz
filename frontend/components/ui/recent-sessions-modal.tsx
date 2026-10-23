"use client"

import { useState, useEffect } from 'react'
import { X, Clock, MessageSquare, Trash2 } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { chatStorage } from '@/lib/chat-storage'

interface ChatMessage {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
  results?: any[]
}

interface ChatSession {
  id: string
  messages: ChatMessage[]
  lastUpdated: Date
}

interface RecentSessionsModalProps {
  isOpen: boolean
  onClose: () => void
  onLoadSession: (messages: ChatMessage[]) => void
}

export function RecentSessionsModal({ isOpen, onClose, onLoadSession }: RecentSessionsModalProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const recentSessions = await chatStorage.getRecentChatSessions()
      setSessions(recentSessions)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadSession = (session: ChatSession) => {
    onLoadSession(session.messages)
    onClose()
  }

  const handleDeleteSession = async (sessionId: string) => {
    setDeleting(sessionId)
    try {
      await chatStorage.deleteChatSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('Failed to delete session:', error)
    } finally {
      setDeleting(null)
    }
  }

  const performClearAllSessions = async () => {
    setClearingAll(true)
    try {
      await chatStorage.clearAllSessions()
      setSessions([])
      setClearAllConfirmOpen(false)
    } catch (error) {
      console.error('Failed to clear all sessions:', error)
    } finally {
      setClearingAll(false)
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const truncateContent = (content: string, maxLength: number = 50) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-action" />
            <h2 className="text-lg font-semibold text-fg">Recent Chat Sessions</h2>
          </div>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
              <span className="ml-2 text-fg-muted">Loading sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-fg-muted">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-fg-subtle" />
              <p>No recent chat sessions found</p>
              <p className="text-sm">Your chat history will appear here after you start conversations</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="border border-line rounded-lg p-3 hover:border-line-strong transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <MessageSquare className="h-4 w-4 text-action" />
                        <span className="text-sm font-medium text-fg">
                          {session.messages.length} messages
                        </span>
                        <span className="text-xs text-fg-muted">
                          {formatDate(session.lastUpdated)}
                        </span>
                      </div>

                      {/* Preview of first user message */}
                      {session.messages.find(m => m.type === 'user') && (
                        <p className="text-sm text-fg-muted mb-2">
                          <span className="font-medium">Query:</span>{' '}
                          {truncateContent(session.messages.find(m => m.type === 'user')!.content)}
                        </p>
                      )}

                      {/* Preview of first AI response */}
                      {session.messages.find(m => m.type === 'ai') && (
                        <p className="text-sm text-fg-muted">
                          <span className="font-medium">Response:</span>{' '}
                          {truncateContent(session.messages.find(m => m.type === 'ai')!.content)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 ml-3">
                      <button
                        onClick={() => handleLoadSession(session)}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-action-hover transition-colors"
                        title="Load this session"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        disabled={deleting === session.id}
                        className="p-1.5 text-fg-subtle hover:text-danger transition-colors disabled:opacity-50"
                        title="Delete this session"
                      >
                        {deleting === session.id ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {sessions.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-line">
            <span className="text-sm text-fg-muted">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} stored
            </span>
            <button
              type="button"
              onClick={() => setClearAllConfirmOpen(true)}
              className="px-3 py-1.5 text-xs text-tag-red-fg hover:text-danger hover:bg-tag-red-bg rounded transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={clearAllConfirmOpen}
        onOpenChange={setClearAllConfirmOpen}
        icon={<Trash2 className="h-3.5 w-3.5" />}
        iconVariant="red"
        title="Clear all chat sessions"
        subtitle="Stored sessions will be removed from this browser."
        description="This cannot be undone."
        confirmLabel="Clear all"
        confirmVariant="red"
        onCancel={() => setClearAllConfirmOpen(false)}
        onConfirm={() => void performClearAllSessions()}
        loading={clearingAll}
      />
    </div>
  )
}
