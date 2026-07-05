'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

/** Current search root (scope) when Search pane is open; updated by file list when breadcrumb root changes. */
export type SearchRootValue = {
  searchRootFolderId: string | null
  searchRootLabel: string | null
} | null

/** Four display sizes for the right pane. */
export type PaneSize = 'small' | 'medium' | 'large'

/**
 * Reusable right sidebar context. Any part of the app can set content + title to show
 * in the layout right panel (e.g. document Edit, document Preview, share detail, etc.).
 * When hasRightPane is true, prefer opening in the sidebar; otherwise fall back to sheet/modal.
 */
type RightPaneContextValue = {
  content: ReactNode
  /** Increments each time setContent is called — use as animation key. */
  contentKey: number
  title: string
  setContent: (node: ReactNode) => void
  setTitle: (t: string) => void
  /** Optional icon to show next to the title in the right panel header. */
  headerIcon: ReactNode
  setHeaderIcon: (node: ReactNode) => void
  /** Optional tooltip text for the header icon. */
  iconTooltip: string
  setIconTooltip: (t: string) => void
  /** Optional subtitle to show under the title in the right panel header. */
  headerSubtitle: string
  setHeaderSubtitle: (t: string) => void
  clearPane: () => void
  /** Optional actions (e.g. Search icon) to show in the right panel header; set by page content (e.g. EngagementFileList). */
  headerActions: ReactNode
  setHeaderActions: (node: ReactNode) => void
  /** True when inside RightPaneProvider (e.g. d/o layout); use to open in sidebar instead of sheet */
  hasRightPane: boolean
  /** Current search root (scope) for Search pane; file list keeps this in sync with FILES breadcrumb. */
  searchRoot: SearchRootValue
  setSearchRoot: (v: SearchRootValue) => void
  /** Current size state of the right pane. */
  paneSize: PaneSize
  setPaneSize: (size: PaneSize) => void
  /** Backwards-compat: true when paneSize === 'large'. */
  isExpanded: boolean
  /** Backwards-compat: setExpanded(true) → 'large', setExpanded(false) → 'small'. */
  setExpanded: (v: boolean) => void
}

const RightPaneContext = createContext<RightPaneContextValue | null>(null)

export function RightPaneProvider({ children }: { children: ReactNode }) {
  const [content, setContentState] = useState<ReactNode>(null)
  const contentKeyRef = useRef(0)
  const [contentKey, setContentKey] = useState(0)
  const [title, setTitleState] = useState<string>('')
  const [headerIcon, setHeaderIconState] = useState<ReactNode>(null)
  const [iconTooltip, setIconTooltipState] = useState<string>('')
  const [headerSubtitle, setHeaderSubtitleState] = useState<string>('')
  const [headerActions, setHeaderActionsState] = useState<ReactNode>(null)
  const [searchRoot, setSearchRootState] = useState<SearchRootValue>(null)
  const [paneSize, setPaneSizeState] = useState<PaneSize>('small')

  const setContent = useCallback((node: ReactNode) => {
    contentKeyRef.current += 1
    setContentKey(contentKeyRef.current)
    setContentState(node)
  }, [])
  const setTitle = useCallback((t: string) => setTitleState(t), [])
  const setHeaderIcon = useCallback((node: ReactNode) => setHeaderIconState(node), [])
  const setIconTooltip = useCallback((t: string) => setIconTooltipState(t), [])
  const setHeaderSubtitle = useCallback((t: string) => setHeaderSubtitleState(t), [])
  const setHeaderActions = useCallback((node: ReactNode) => setHeaderActionsState(node), [])
  const setSearchRoot = useCallback((v: SearchRootValue) => setSearchRootState(v), [])
  const setPaneSize = useCallback((size: PaneSize) => setPaneSizeState(size), [])

  const clearPane = useCallback(() => {
    setContentState(null)
    setTitleState('')
    setHeaderIconState(null)
    setIconTooltipState('')
    setHeaderSubtitleState('')
    setHeaderActionsState(null)
    setPaneSizeState('small')
  }, [])

  // Backwards compat
  const isExpanded = paneSize === 'large'
  const setExpanded = useCallback((v: boolean) => {
    setPaneSizeState(v ? 'large' : 'small')
  }, [])

  return (
    <RightPaneContext.Provider
      value={{
        content, contentKey, title, setContent, setTitle,
        headerIcon, setHeaderIcon,
        iconTooltip, setIconTooltip,
        headerSubtitle, setHeaderSubtitle,
        clearPane,
        headerActions, setHeaderActions,
        hasRightPane: true,
        searchRoot, setSearchRoot,
        paneSize, setPaneSize,
        isExpanded, setExpanded,
      }}
    >
      {children}
    </RightPaneContext.Provider>
  )
}

export function useRightPane(): RightPaneContextValue {
  const ctx = useContext(RightPaneContext)
  if (!ctx) {
    return {
      content: null, contentKey: 0, title: '',
      setContent: () => {}, setTitle: () => {},
      headerIcon: null, setHeaderIcon: () => {},
      iconTooltip: '', setIconTooltip: () => {},
      headerSubtitle: '', setHeaderSubtitle: () => {},
      clearPane: () => {},
      headerActions: null, setHeaderActions: () => {},
      hasRightPane: false,
      searchRoot: null, setSearchRoot: () => {},
      paneSize: 'small', setPaneSize: () => {},
      isExpanded: false, setExpanded: () => {},
    }
  }
  return ctx
}
