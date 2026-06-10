import type { DriveFile } from '@/lib/types'

type ProjectSearchState = {
  searchQuery: string
  searchResults: DriveFile[]
  isSearching: boolean
  recentSearches: string[]
}

type Listener = () => void

const stateByProject = new Map<string, ProjectSearchState>()
const listenersByProject = new Map<string, Set<Listener>>()

export function getProjectSearchState(
  projectId: string,
  getInitialRecentSearches: () => string[]
): ProjectSearchState {
  let state = stateByProject.get(projectId)
  if (!state) {
    state = {
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      recentSearches: getInitialRecentSearches(),
    }
    stateByProject.set(projectId, state)
  }
  return state
}

export function setProjectSearchState(
  projectId: string,
  partial: Partial<ProjectSearchState>,
  getInitialRecentSearches: () => string[]
): void {
  const current = getProjectSearchState(projectId, getInitialRecentSearches)
  const next = { ...current, ...partial }
  stateByProject.set(projectId, next)
  const listeners = listenersByProject.get(projectId)
  if (listeners) {
    listeners.forEach((cb) => cb())
  }
}

export function subscribeToProjectSearch(projectId: string, listener: Listener): () => void {
  let listeners = listenersByProject.get(projectId)
  if (!listeners) {
    listeners = new Set()
    listenersByProject.set(projectId, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners!.delete(listener)
  }
}

