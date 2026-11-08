'use client'

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRightPane } from '@/lib/right-pane-context'
import { logger } from '@/lib/logger'
import type { DriveFile } from '@/lib/types'
import { failureReason } from '@/lib/files/action-failure'
import { searchFailureFrom } from '@/components/search/search-failed'
import {
  getProjectSearchState,
  setProjectSearchState,
  subscribeToProjectSearch,
} from './engagement-search-store'

const RECENT_SEARCH_KEY = (projectId: string) => `fm_search_recent_${projectId}`
const RECENT_SEARCH_MAX = 8

function getRecentSearches(projectId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(RECENT_SEARCH_KEY(projectId))
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCH_MAX) : []
  } catch {
    return []
  }
}

function pushRecentSearch(projectId: string, query: string) {
  if (typeof window === 'undefined' || !query.trim()) return
  const prev = getRecentSearches(projectId).filter((q) => q.trim().toLowerCase() !== query.trim().toLowerCase())
  const next = [query.trim(), ...prev].slice(0, RECENT_SEARCH_MAX)
  try {
    sessionStorage.setItem(RECENT_SEARCH_KEY(projectId), JSON.stringify(next))
  } catch {
    // ignore
  }
}

type EngagementSearchContextValue = {
  searchQuery: string
  setSearchQuery: (q: string) => void
  searchResults: DriveFile[]
  setSearchResults: (r: DriveFile[]) => void
  isSearching: boolean
  setIsSearching: (v: boolean) => void
  closeSearchPanel: () => void
  recentSearches: string[]
  addRecentSearch: (q: string) => void
  clearRecentSearches: () => void
  /** When search is scoped, e.g. "General", "Confidential", "Staging". */
  searchRootLabel: string | null
  /** Why the last search couldn't run, or null. A failed search is never shown as "No results" (EM-6). */
  searchError: string | null
  /** Runs the current search again. */
  retrySearch: () => void
}

const EngagementSearchContext = createContext<EngagementSearchContextValue | null>(null)

const DEBOUNCE_MS = 400

interface EngagementSearchProviderProps {
  projectId: string
  children: ReactNode
  /** Optional viewAs for EC/Guest filtering when API supports it */
  viewAsPersonaSlug?: string | null
  /** When set, search is scoped to this folder and its descendants (e.g. General, Confidential, or Staging root). */
  searchRootFolderId?: string | null
  /** Human-readable scope label, e.g. "General", "Confidential", "Staging". */
  searchRootLabel?: string | null
}

export function EngagementSearchProvider({
  projectId,
  children,
  viewAsPersonaSlug,
  searchRootFolderId: searchRootFolderIdProp,
  searchRootLabel: searchRootLabelProp,
}: EngagementSearchProviderProps) {
  const { session } = useAuth()
  const rightPane = useRightPane()
  const store = useSyncExternalStore(
    (cb) => subscribeToProjectSearch(projectId, cb),
    () => getProjectSearchState(projectId, () => getRecentSearches(projectId)),
    () => getProjectSearchState(projectId, () => [])
  )
  const { searchQuery, searchResults, isSearching, recentSearches } = store
  const searchRootFolderId = rightPane.searchRoot?.searchRootFolderId ?? searchRootFolderIdProp ?? null
  const searchRootLabel = rightPane.searchRoot?.searchRootLabel ?? searchRootLabelProp ?? null

  const [searchError, setSearchError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const retrySearch = useCallback(() => setRetryCount((n) => n + 1), [])

  const closeSearchPanel = useCallback(() => {
    rightPane.clearPane()
  }, [rightPane])

  const addRecentSearch = useCallback(
    (q: string) => {
      if (!q.trim()) return
      pushRecentSearch(projectId, q)
      setProjectSearchState(projectId, { recentSearches: getRecentSearches(projectId) }, () =>
        getRecentSearches(projectId)
      )
    },
    [projectId]
  )

  const clearRecentSearches = useCallback(() => {
    try {
      sessionStorage.removeItem(RECENT_SEARCH_KEY(projectId))
      setProjectSearchState(projectId, { recentSearches: [] }, () => [])
    } catch {
      setProjectSearchState(projectId, { recentSearches: [] }, () => [])
    }
  }, [projectId])

  // When search root (scope) changes, clear results so we refetch with the new root and don't show stale scope
  useEffect(() => {
    setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
  }, [searchRootFolderId, projectId])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setProjectSearchState(projectId, { isSearching: true }, () => getRecentSearches(projectId))
        try {
          const params = new URLSearchParams({ q: searchQuery.trim() })
          if (viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer') {
            params.set('viewAs', viewAsPersonaSlug)
          }
          if (searchRootFolderId) {
            params.set('rootFolderId', searchRootFolderId)
          }
          const res = await fetch(`/api/projects/${projectId}/search?${params}`, {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          })
          if (!res.ok) throw await searchFailureFrom(res)
          const data = await res.json()
          setSearchError(null)
          setProjectSearchState(
            projectId,
            { searchResults: data.files || [] },
            () => getRecentSearches(projectId)
          )
          pushRecentSearch(projectId, searchQuery.trim())
          setProjectSearchState(
            projectId,
            { recentSearches: getRecentSearches(projectId) },
            () => getRecentSearches(projectId)
          )
        } catch (e) {
          logger.error('Search failed', e as Error)
          setSearchError(failureReason(e))
          setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
        } finally {
          setProjectSearchState(projectId, { isSearching: false }, () => getRecentSearches(projectId))
        }
      } else {
        setSearchError(null)
        setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchQuery, projectId, session?.access_token, viewAsPersonaSlug, searchRootFolderId, retryCount])

  const value: EngagementSearchContextValue = {
    searchQuery,
    setSearchQuery: (q: string) =>
      setProjectSearchState(projectId, { searchQuery: q }, () => getRecentSearches(projectId)),
    searchResults,
    setSearchResults: (r: DriveFile[]) =>
      setProjectSearchState(projectId, { searchResults: r }, () => getRecentSearches(projectId)),
    isSearching,
    setIsSearching: (v: boolean) =>
      setProjectSearchState(projectId, { isSearching: v }, () => getRecentSearches(projectId)),
    closeSearchPanel,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    searchRootLabel,
    searchError,
    retrySearch,
  }

  return (
    <EngagementSearchContext.Provider value={value}>
      {children}
    </EngagementSearchContext.Provider>
  )
}

export function useEngagementSearch(): EngagementSearchContextValue {
  const ctx = useContext(EngagementSearchContext)
  if (!ctx) {
    return {
      searchQuery: '',
      setSearchQuery: () => {},
      searchResults: [],
      setSearchResults: () => {},
      isSearching: false,
      setIsSearching: () => {},
      closeSearchPanel: () => {},
      recentSearches: [],
      addRecentSearch: () => {},
      clearRecentSearches: () => {},
      searchRootLabel: null,
      searchError: null,
      retrySearch: () => {},
    }
  }
  return ctx
}
