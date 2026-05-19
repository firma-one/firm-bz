import { createClient } from '@/utils/supabase/server'
import { ProfilePageClient } from '@/app/(app)/d/profile/profile-page-client'

function deriveProfileNames(meta: Record<string, unknown> | undefined): {
    firstName: string
    lastName: string
} {
    const m = meta ?? {}
    const hasExplicitFirst = typeof m.first_name === 'string'
    const hasExplicitLast = typeof m.last_name === 'string'
    if (hasExplicitFirst || hasExplicitLast) {
        return {
            firstName: hasExplicitFirst ? (m.first_name as string).trim() : '',
            lastName: hasExplicitLast ? (m.last_name as string).trim() : '',
        }
    }
    const combined =
        (typeof m.full_name === 'string' && m.full_name.trim()) ||
        (typeof m.name === 'string' && m.name.trim()) ||
        ''
    if (!combined) return { firstName: '', lastName: '' }
    const space = combined.indexOf(' ')
    if (space === -1) return { firstName: combined, lastName: '' }
    return {
        firstName: combined.slice(0, space).trim(),
        lastName: combined.slice(space + 1).trim(),
    }
}

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
        return (
            <div className="py-12 text-center text-sm text-slate-600">
                Sign in to view your profile.
            </div>
        )
    }

    const meta = user.user_metadata as Record<string, unknown> | undefined
    const { firstName, lastName } = deriveProfileNames(meta)
    const displayName =
        (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta?.name === 'string' && meta.name.trim()) ||
        user.email.split('@')[0]
    const avatarUrl =
        (typeof meta?.avatar_url === 'string' && meta.avatar_url) ||
        (typeof meta?.picture === 'string' && meta.picture) ||
        null

    return (
        <ProfilePageClient
            displayName={displayName}
            firstName={firstName}
            lastName={lastName}
            email={user.email}
            avatarUrl={avatarUrl}
            hideChrome
        />
    )
}
