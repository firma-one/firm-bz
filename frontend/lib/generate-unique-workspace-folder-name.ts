import { BRAND_NAME } from '@/config/brand'

function randomSuffixId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Generate a unique workspace folder name.
 * Output: `_<BRAND_NAME>_workspace_<randomSuffixId>_`
 */
export function generateWorkspaceFolderName(): string {
  return `_${BRAND_NAME}_workspace_${randomSuffixId()}_`
}

/** @deprecated Use generateWorkspaceFolderName() instead. */
export type WorkspaceUniqueFolderLocation = 'my-drive' | 'shared-drive'

/** @deprecated Use generateWorkspaceFolderName() instead. */
export function generateUniqueWorkspaceFolderName(_location?: WorkspaceUniqueFolderLocation): string {
  return generateWorkspaceFolderName()
}

/** @deprecated Use generateWorkspaceFolderName() instead. */
export function generateUniqueSharedWorkspaceFolderName(): string {
  return generateWorkspaceFolderName()
}
