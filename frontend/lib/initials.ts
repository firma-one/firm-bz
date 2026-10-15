/**
 * Avatar initials, the same everywhere a person is shown: the first letters of the first and last
 * words ("Deepak Shettigar" → "DS"), one letter for a single word ("Deepak" → "D"). An email uses its
 * local part split on . _ - ("deepak.shettigar@firm.com" → "DS"). A leading "@" (mentions) is ignored.
 */
export function initialsOf(nameOrEmail: string | null | undefined, fallback = '?'): string {
    const raw = (nameOrEmail ?? '').trim().replace(/^@/, '')
    if (!raw) return fallback
    const base = raw.includes('@') ? raw.split('@')[0] : raw
    const words = base.split(/[\s._-]+/).filter(Boolean)
    if (words.length === 0) return fallback
    const first = words[0][0] ?? ''
    const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
    return (first + last).toUpperCase() || fallback
}
