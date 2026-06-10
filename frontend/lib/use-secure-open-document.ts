'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface SecureOpenDocumentInput {
  /** Document id for regrant API (search index id or externalId). */
  documentId: string
  fileName: string
  mimeType?: string
  externalId: string
  firmId?: string
  /** When provided, used for regrant API (e.g. dashboard list with mixed projects). */
  projectId?: string
  /** Optional; used for fallback open when regrant fails (e.g. document not in Shares). */
  webViewLink?: string
}

export interface SecureOpenModalData {
  email: string
  fileName: string
  mimeType?: string
  externalId?: string
  firmId?: string
}

export interface UseSecureOpenDocumentOptions {
  /** When omitted, each call must provide doc.projectId (e.g. dashboard with mixed projects). */
  projectId?: string
  /** Optional; used for modal thumbnail proxy when opening from project context. */
  firmId?: string
  /** Optional log context for errors (e.g. 'ProjectShares', 'EngagementFileList'). */
  logContext?: string
  /** When regrant fails (e.g. no sharing record), call with doc so caller can open link directly. */
  onRegrantFailed?: (doc: SecureOpenDocumentInput) => void
}

export function useSecureOpenDocument({
  projectId,
  firmId: hookFirmId,
  logContext = 'SecureOpen',
  onRegrantFailed,
}: UseSecureOpenDocumentOptions) {
  const [secureModalOpen, setSecureModalOpen] = useState(false)
  const [secureModalData, setSecureModalData] = useState<SecureOpenModalData>({
    email: '',
    fileName: '',
  })
  const [isRegrantingId, setIsRegrantingId] = useState<string | null>(null)

  const handleSecureOpen = useCallback(
    async (doc: SecureOpenDocumentInput, itemId?: string) => {
      const effectiveProjectId = doc.projectId ?? projectId
      if (!effectiveProjectId) return
      const id = itemId ?? doc.documentId
      setIsRegrantingId(id)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const res = await fetch(
          `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(doc.documentId)}/sharing/regrant`,
          { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }
        )

        if (!res.ok) {
          if (onRegrantFailed && (doc.webViewLink || doc.externalId)) {
            logger.debug(
              'Regrant failed, using fallback open',
              logContext,
              { documentId: doc.documentId, status: res.status }
            )
            onRegrantFailed({
              ...doc,
              webViewLink: doc.webViewLink || (doc.externalId ? `https://drive.google.com/file/d/${doc.externalId}/view` : undefined),
            })
          } else {
            throw new Error('Failed to re-grant access')
          }
          return
        }

        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email || user?.user_metadata?.email || 'your email'

        setSecureModalData({
          email,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          externalId: doc.externalId,
          firmId: doc.firmId ?? hookFirmId,
        })
        setSecureModalOpen(true)
      } catch (e) {
        logger.error(
          'Failed to trigger secure access',
          e instanceof Error ? e : new Error(String(e)),
          logContext,
          { documentId: doc.documentId }
        )
      } finally {
        setIsRegrantingId(null)
      }
    },
    [projectId, hookFirmId, logContext, onRegrantFailed]
  )

  const canSecureOpen = (doc: SecureOpenDocumentInput) => Boolean(doc.projectId ?? projectId)

  return {
    handleSecureOpen,
    canSecureOpen,
    secureModalOpen,
    secureModalData,
    setSecureModalOpen,
    isRegrantingId,
  }
}
