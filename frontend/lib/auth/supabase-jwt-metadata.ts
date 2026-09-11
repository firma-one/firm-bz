/**
 * Supabase access tokens embed `app_metadata`. Every API request sends `Authorization: Bearer <jwt>`,
 * so this object must stay tiny (Node/Next enforce ~8–16kb total header size → 431 if exceeded).
 *
 * **Allowlisted keys only.** Unknown keys (e.g. legacy `billing_by_anchor`, `plan_entitlements`) are
 * dropped on merge so updates actively shrink the JWT.
 *
 * Reads in-app: `active_firm_id` + `active_persona` (permission-helpers' fast path, notifications,
 * sidebar). `active_firm_slug` is optional UX; kept small.
 *
 * `role` was listed here for a claimed `SYS_ADMIN` override, but nothing in the codebase ever read
 * it — not TypeScript, not RLS policies — so it was removed and is now stripped on merge like any
 * other unknown key. System access is `system_admins` or `firm_admin` of the system-management
 * firm; see permission-helpers' isSystemManagementAdmin.
 */
export const JWT_APP_METADATA_KEYS = [
    'active_firm_id',
    'active_firm_slug',
    'active_persona',
] as const

export type JwtAppMetadataKey = (typeof JWT_APP_METADATA_KEYS)[number]

const MAX_STRING_LEN = 256

function isAllowedString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LEN
}

/**
 * Merge workspace / admin claims into a lean `app_metadata` payload for `updateUserById`.
 * - Preserves allowlisted keys from `existing` when not overridden by `patch`.
 * - Strips all non-allowlisted keys.
 */
export function mergeLeanAppMetadata(
    existing: Record<string, unknown> | null | undefined,
    patch: Partial<Record<JwtAppMetadataKey, string | undefined>>
): Record<string, string> {
    const out: Record<string, string> = {}
    const src = existing ?? {}

    for (const key of JWT_APP_METADATA_KEYS) {
        const patched = patch[key]
        const candidate = patched !== undefined ? patched : src[key]
        if (candidate == null || candidate === '') continue
        if (!isAllowedString(candidate)) continue
        out[key] = candidate
    }
    return out
}
