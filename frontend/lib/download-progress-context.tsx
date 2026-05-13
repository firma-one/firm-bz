'use client'

import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

export type DownloadTaskStatus = 'preparing' | 'complete' | 'error'

export interface DownloadTask {
  id: string
  label: string
  status: DownloadTaskStatus
  error?: string
}

interface DownloadProgressContextValue {
  tasks: DownloadTask[]
  addTask: (label: string) => string
  updateTask: (id: string, updates: Partial<Pick<DownloadTask, 'status' | 'error'>>) => void
  dismiss: () => void
}

const DownloadProgressContext = createContext<DownloadProgressContextValue | null>(null)

export function DownloadProgressProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const counterRef = useRef(0)

  const addTask = useCallback((label: string): string => {
    const id = `dl-${++counterRef.current}`
    setTasks(prev => [...prev, { id, label, status: 'preparing' }])
    return id
  }, [])

  const updateTask = useCallback((id: string, updates: Partial<Pick<DownloadTask, 'status' | 'error'>>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const dismiss = useCallback(() => setTasks([]), [])

  return (
    <DownloadProgressContext.Provider value={{ tasks, addTask, updateTask, dismiss }}>
      {children}
    </DownloadProgressContext.Provider>
  )
}

export function useDownloadProgress(): DownloadProgressContextValue {
  const ctx = useContext(DownloadProgressContext)
  if (!ctx) {
    return { tasks: [], addTask: () => '', updateTask: () => {}, dismiss: () => {} }
  }
  return ctx
}
