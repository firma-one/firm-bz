/**
 * Session storage keys and helpers for "last opened folder" in the project Files tab.
 * Shared by engagement-file-list (read/write on navigate) and engagement-workspace (write from Shares "Open in Files").
 */

export type BreadcrumbItem = {
  id: string
  name: string
  clickable?: boolean
}

const FILES_LAST_FOLDER_KEY = (projectId: string) => `fm_files_last_folder_${projectId}`
const FILES_BREADCRUMBS_KEY = (projectId: string) => `fm_files_breadcrumbs_${projectId}`
const FILES_DEEPLINK_HIGHLIGHT_KEY = (projectId: string) => `fm_files_deeplink_highlight_${projectId}`

export function getSavedFolderState(projectId: string): { folderId: string | null; breadcrumbs: BreadcrumbItem[] } {
  if (typeof window === 'undefined') return { folderId: null, breadcrumbs: [] }
  try {
    const folderId = sessionStorage.getItem(FILES_LAST_FOLDER_KEY(projectId))
    const raw = sessionStorage.getItem(FILES_BREADCRUMBS_KEY(projectId))
    const breadcrumbs: BreadcrumbItem[] = raw ? JSON.parse(raw) : []
    return { folderId, breadcrumbs }
  } catch {
    return { folderId: null, breadcrumbs: [] }
  }
}

export function setSavedFolderState(projectId: string, folderId: string | null, breadcrumbs: BreadcrumbItem[]) {
  if (typeof window === 'undefined') return
  try {
    if (folderId) {
      sessionStorage.setItem(FILES_LAST_FOLDER_KEY(projectId), folderId)
      sessionStorage.setItem(FILES_BREADCRUMBS_KEY(projectId), JSON.stringify(breadcrumbs))
    } else {
      sessionStorage.removeItem(FILES_LAST_FOLDER_KEY(projectId))
      sessionStorage.removeItem(FILES_BREADCRUMBS_KEY(projectId))
    }
  } catch {
    // ignore
  }
}

/** Store a file/folder external ID to highlight once the Files tab loads at the target folder. Consumed once on read. */
export function setDeeplinkHighlight(projectId: string, externalId: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(FILES_DEEPLINK_HIGHLIGHT_KEY(projectId), externalId)
  } catch { /* ignore */ }
}

/** Read and immediately clear the pending deeplink highlight. Returns null if none. */
export function consumeDeeplinkHighlight(projectId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const val = sessionStorage.getItem(FILES_DEEPLINK_HIGHLIGHT_KEY(projectId))
    if (val) sessionStorage.removeItem(FILES_DEEPLINK_HIGHLIGHT_KEY(projectId))
    return val
  } catch {
    return null
  }
}
