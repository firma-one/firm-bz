import { BRAND_NAME } from '@/config/brand'

const workspaceEnv = (
  process.env.WORKSPACE_ENV ||
  process.env.NEXT_PUBLIC_WORKSPACE_ENV ||
  ''
).trim()

/**
 * Default workspace folder name in Drive (matches onboarding / ensureDefaultWorkspaceRoot).
 * @deprecated Use generateWorkspaceFolderName() from @/lib/generate-unique-workspace-folder-name instead.
 */
export const SUGGESTED_WORKSPACE_FOLDER_NAME = workspaceEnv
  ? `_${BRAND_NAME}_workspace_${workspaceEnv}_`
  : `_${BRAND_NAME}_workspace_`
