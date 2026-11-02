'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type UploadQueueItemStatus = 'pending' | 'uploading' | 'completed' | 'error'

/** Where an item uploads to, kept on the item so a failed one can be retried to the same place. */
export interface UploadTarget {
  /** The folder it uploads into. */
  parentFolderId?: string
  /** The existing file it replaces (the duplicate dialog's Replace). */
  overwriteId?: string
  /** Saved under a numbered name beside an existing file (the duplicate dialog's keep-both). */
  rename?: boolean
}

export interface UploadQueueItem {
  id: string
  file: File
  progress: number
  status: UploadQueueItemStatus
  error?: string
  finalName?: string
  target?: UploadTarget
}

type RetryUploads = (items: UploadQueueItem[]) => void

interface UploadProgressContextValue {
  uploadQueue: UploadQueueItem[]
  isUploading: boolean
  isUploadInitiating: boolean
  isUploadModalOpen: boolean
  dismissedRef: React.MutableRefObject<boolean>
  onShowFileLocation: ((name: string) => void) | null
  /** Uploads failed items again; null when no Files page is open to run them. */
  onRetry: RetryUploads | null
  addToQueue: (items: UploadQueueItem[]) => void
  updateQueueItem: (id: string, updates: Partial<UploadQueueItem>) => void
  setIsUploading: (v: boolean) => void
  setIsUploadInitiating: (v: boolean) => void
  setIsUploadModalOpen: (v: boolean) => void
  setShowFileLocationCallback: (fn: ((name: string) => void) | null) => void
  setRetryCallback: (fn: RetryUploads | null) => void
  dismiss: () => void
}

const UploadProgressContext = createContext<UploadProgressContextValue | null>(null)

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadInitiating, setIsUploadInitiating] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(true)
  const [onShowFileLocation, setOnShowFileLocation] = useState<((name: string) => void) | null>(null)
  const [onRetry, setOnRetry] = useState<RetryUploads | null>(null)
  const dismissedRef = useRef(false)

  // Warn before page refresh / tab close while uploads are in progress
  useEffect(() => {
    if (!isUploading && !isUploadInitiating) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isUploading, isUploadInitiating])

  // Auto-clear queue 8s after uploads finish — unless something failed: those rows stay until
  // they are retried or the panel is closed, so the person can see which file it was.
  const hasFailures = uploadQueue.some(i => i.status === 'error')
  useEffect(() => {
    if (isUploading || uploadQueue.length === 0 || hasFailures) return
    const timer = setTimeout(() => {
      if (!isUploading) setUploadQueue([])
    }, 8000)
    return () => clearTimeout(timer)
  }, [isUploading, uploadQueue.length, hasFailures])

  const addToQueue = useCallback((items: UploadQueueItem[]) => {
    setUploadQueue(prev => [...prev, ...items])
  }, [])

  const updateQueueItem = useCallback((id: string, updates: Partial<UploadQueueItem>) => {
    setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }, [])

  const dismiss = useCallback(() => {
    dismissedRef.current = true
    setUploadQueue([])
    setIsUploading(false)
    setIsUploadInitiating(false)
  }, [])

  const setShowFileLocationCallback = useCallback((fn: ((name: string) => void) | null) => {
    setOnShowFileLocation(() => fn)
  }, [])

  const setRetryCallback = useCallback((fn: RetryUploads | null) => {
    setOnRetry(() => fn)
  }, [])

  return (
    <UploadProgressContext.Provider value={{
      uploadQueue,
      isUploading,
      isUploadInitiating,
      isUploadModalOpen,
      dismissedRef,
      onShowFileLocation,
      onRetry,
      addToQueue,
      updateQueueItem,
      setIsUploading,
      setIsUploadInitiating,
      setIsUploadModalOpen,
      setShowFileLocationCallback,
      setRetryCallback,
      dismiss,
    }}>
      {children}
    </UploadProgressContext.Provider>
  )
}

export function useUploadProgress(): UploadProgressContextValue {
  const ctx = useContext(UploadProgressContext)
  if (!ctx) throw new Error('useUploadProgress must be used within UploadProgressProvider')
  return ctx
}
