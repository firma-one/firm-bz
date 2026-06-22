export type BreadcrumbItem = {
  id: string
  name: string
  clickable?: boolean
  isPendingApproval?: boolean
}

const FILES_DEEPLINK_HIGHLIGHT_KEY = (projectId: string) => `fm_files_deeplink_highlight_${projectId}`

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
