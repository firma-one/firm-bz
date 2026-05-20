'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'fm-whats-new-last-seen-version'

export interface ReleaseMeta {
  version: string
  commit: string
  date: string
  title: string
  type: 'major' | 'minor' | 'patch'
}

export function useWhatsNew(releases: ReleaseMeta[]): {
  hasUnread: boolean
  markAsRead: () => void
} {
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    if (!releases.length) return
    try {
      const seen = localStorage.getItem(STORAGE_KEY)
      setHasUnread(seen !== releases[0].version)
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }, [releases])

  const markAsRead = useCallback(() => {
    if (!releases.length) return
    try {
      localStorage.setItem(STORAGE_KEY, releases[0].version)
    } catch {
      // ignore
    }
    setHasUnread(false)
  }, [releases])

  return { hasUnread, markAsRead }
}
