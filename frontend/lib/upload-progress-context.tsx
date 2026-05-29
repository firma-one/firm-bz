'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type UploadQueueItemStatus = 'pending' | 'uploading' | 'completed' | 'error'

export interface UploadQueueItem {
  id: string
  file: File
  progress: number
  status: UploadQueueItemStatus
  error?: string
  finalName?: string
}

interface UploadProgressContextValue {
  uploadQueue: UploadQueueItem[]
  isUploading: boolean
  isUploadInitiating: boolean
  isUploadModalOpen: boolean
  dismissedRef: React.MutableRefObject<boolean>
  onShowFileLocation: ((name: string) => void) | null
  addToQueue: (items: UploadQueueItem[]) => void
  updateQueueItem: (id: string, updates: Partial<UploadQueueItem>) => void
  setIsUploading: (v: boolean) => void
  setIsUploadInitiating: (v: boolean) => void
  setIsUploadModalOpen: (v: boolean) => void
  setShowFileLocationCallback: (fn: ((name: string) => void) | null) => void
  dismiss: () => void
}

const UploadProgressContext = createContext<UploadProgressContextValue | null>(null)

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadInitiating, setIsUploadInitiating] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(true)
  const [onShowFileLocation, setOnShowFileLocation] = useState<((name: string) => void) | null>(null)
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

  // Auto-clear queue 8s after uploads finish
  useEffect(() => {
    if (isUploading || uploadQueue.length === 0) return
    const timer = setTimeout(() => {
      if (!isUploading) setUploadQueue([])
    }, 8000)
    return () => clearTimeout(timer)
  }, [isUploading, uploadQueue.length])

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

  return (
    <UploadProgressContext.Provider value={{
      uploadQueue,
      isUploading,
      isUploadInitiating,
      isUploadModalOpen,
      dismissedRef,
      onShowFileLocation,
      addToQueue,
      updateQueueItem,
      setIsUploading,
      setIsUploadInitiating,
      setIsUploadModalOpen,
      setShowFileLocationCallback,
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
