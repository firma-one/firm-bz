/**
 * Default display name for the sandbox firm when the user has not overridden it.
 * Uses first name from auth metadata; falls back to JSON `firmName` (e.g. "My Firm").
 * Names containing apostrophes are rare; a straight quote in "O'Brien's Firm" is acceptable.
 */
export function buildDefaultSandboxFirmName(
    firstName: string | null | undefined,
    fallback: string
): string {
    const t = (firstName ?? '').trim()
    if (!t) return fallback
    const capitalized = t.charAt(0).toUpperCase() + t.slice(1)
    return `${capitalized}'s Firm`
}
