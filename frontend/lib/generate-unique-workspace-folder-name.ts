/** The app-owned parent folder created inside a user-picked location (My Drive root or a Shared Drive folder). */
export const FIRMA_PARENT_FOLDER_NAME = '_firma'

function randomSuffixId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Generate a unique workspace folder name, created inside FIRMA_PARENT_FOLDER_NAME.
 * Output: `_f_workspace_<randomSuffixId>` — no leading/trailing underscore around the suffix, and
 * no brand name, so a Picker query for FIRMA_PARENT_FOLDER_NAME ('_firma') cannot also match a
 * workspace folder by prefix.
 */
export function generateWorkspaceFolderName(): string {
  return `_f_workspace_${randomSuffixId()}`
}
