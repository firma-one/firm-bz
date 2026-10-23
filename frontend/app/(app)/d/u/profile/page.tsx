import { createClient } from '@/utils/supabase/server'
import { ProfilePageClient } from '@/app/(app)/d/profile/profile-page-client'
import { resolveNames } from '@/lib/auth/display-name'

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
    const resolved = resolveNames(meta, user.email)
    const displayName = resolved.displayName || user.email.split('@')[0]
    // The form shows only a name somebody actually supplied. A name derived from the email is a
    // guess for display; prefilling it here would let a Save turn that guess into stored fact.
    const firstName = resolved.authored ? resolved.firstName ?? '' : ''
    const lastName = resolved.authored ? resolved.lastName ?? '' : ''
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
            needsName={!resolved.authored}
            hideChrome
        />
    )
}
