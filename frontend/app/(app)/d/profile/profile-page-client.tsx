'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Mail, User } from 'lucide-react'
import { DataPrivacyCard } from '@/components/account/data-privacy-card'
import { ProfileBubblePopupContent } from '@/components/ui/profile-bubble-popup'
import { profileCopy } from '@/lib/profile-copy'
import { updateProfileNames } from '@/lib/actions/profile'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { initialsOf } from '@/lib/initials'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { PushNotificationToggle } from '@/components/notifications/push-notification-toggle'

export function ProfilePageClient({
    displayName,
    firstName: initialFirstName,
    lastName: initialLastName,
    email,
    avatarUrl,
    needsName = false,
    hideChrome = false,
}: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    avatarUrl: string | null
    /** True when nobody has supplied this person's name, so the one shown is derived from their email. */
    needsName?: boolean
    hideChrome?: boolean
}) {
    const router = useRouter()
    const { addToast } = useToast()
    const [firstName, setFirstName] = useState(initialFirstName)
    const [lastName, setLastName] = useState(initialLastName)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const isDirty =
        firstName !== initialFirstName || lastName !== initialLastName

    useEffect(() => {
        setFirstName(initialFirstName)
        setLastName(initialLastName)
    }, [initialFirstName, initialLastName])

    const handleSaveName = async () => {
        if (!isDirty) return
        setFormError(null)
        setSaving(true)
        const result = await updateProfileNames(firstName, lastName)
        if ('error' in result) {
            setFormError(result.error)
            setSaving(false)
            return
        }
        await supabase.auth.refreshSession()
        router.refresh()
        setSaving(false)
        addToast({ type: 'success', title: 'Saved', message: profileCopy.saveSuccess })
    }

    const accountForm = (
        <div className="space-y-3 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">
                {profileCopy.accountSectionTitle}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="profile-first-name">{profileCopy.firstNameLabel}</Label>
                    <Input
                        id="profile-first-name"
                        name="firstName"
                        autoComplete="given-name"
                        maxLength={80}
                        value={firstName}
                        onChange={(e) => {
                            setFirstName(e.target.value)
                            setFormError(null)
                        }}
                        disabled={saving}
                        className="bg-white"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="profile-last-name">{profileCopy.lastNameLabel}</Label>
                    <Input
                        id="profile-last-name"
                        name="lastName"
                        autoComplete="family-name"
                        maxLength={80}
                        value={lastName}
                        onChange={(e) => {
                            setLastName(e.target.value)
                            setFormError(null)
                        }}
                        disabled={saving}
                        className="bg-white"
                    />
                </div>
            </div>
            {formError && (
                <p className="text-xs text-red-600" role="alert">
                    {formError}
                </p>
            )}
            <Button
                type="button"
                variant="blackCta"
                size="sm"
                onClick={handleSaveName}
                disabled={saving || !isDirty}
            >
                {saving ? profileCopy.saving : profileCopy.saveCta}
            </Button>
        </div>
    )
    if (hideChrome) {
        // The Profile tab (.claude/plans/ui-ux-overhaul.md, Phase 6): property rows like the
        // settings forms, then notification preferences, then export and deletion.
        const initials = initialsOf(displayName, '')
        return (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-10">
                <section>
                    <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Profile</h3>
                    <div className="flex items-center gap-3 px-1 py-2">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                        ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-small font-medium text-fg-muted">
                                {initials || <User className="h-4 w-4" />}
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-ui font-medium text-fg">{displayName}</p>
                            <p className="truncate text-small text-fg-muted">{email}</p>
                        </div>
                    </div>
                    {needsName && !isDirty && (
                        // Invited users arrive without a name and are shown by their email address
                        // until they set one. A quiet line, not a modal: they are usually mid-task
                        // in somebody else's engagement when they first get here.
                        <p className="px-1 pb-2 text-small text-fg-muted">
                            We&rsquo;re showing a name worked out from your email address. Add your real
                            one below so colleagues see it on your comments and files.
                        </p>
                    )}
                    <PropertyList>
                        <PropertyRow label={<label htmlFor="profile-first-name">First name</label>} icon={<User />}>
                            <Input
                                id="profile-first-name"
                                autoComplete="given-name"
                                maxLength={80}
                                value={firstName}
                                onChange={(e) => { setFirstName(e.target.value); setFormError(null) }}
                                disabled={saving}
                                placeholder="Empty"
                                className={PROPERTY_FIELD_CLASS}
                            />
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="profile-last-name">Last name</label>} icon={<User />}>
                            <Input
                                id="profile-last-name"
                                autoComplete="family-name"
                                maxLength={80}
                                value={lastName}
                                onChange={(e) => { setLastName(e.target.value); setFormError(null) }}
                                disabled={saving}
                                placeholder="Empty"
                                className={PROPERTY_FIELD_CLASS}
                            />
                        </PropertyRow>
                        <PropertyRow label="Email" icon={<Mail />}>
                            <div className="flex w-full flex-col gap-1">
                                <div className="flex h-8 items-center gap-1 px-2">
                                    <span className="min-w-0 truncate text-ui text-fg">{email}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        title="Copy email"
                                        aria-label="Copy email"
                                        onClick={() => {
                                            void navigator.clipboard.writeText(email)
                                            addToast({ type: 'success', title: 'Copied', message: 'Email copied.' })
                                        }}
                                        className="h-6 w-6 shrink-0"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <p className={PROPERTY_HINT_CLASS}>Your sign-in email can&apos;t be changed here.</p>
                            </div>
                        </PropertyRow>
                    </PropertyList>
                    {formError && <p className="mt-2 px-2 text-small text-danger" role="alert">{formError}</p>}
                    <div className="mt-4 flex items-center gap-2">
                        <Button type="button" variant="greenCta" onClick={handleSaveName} disabled={saving || !isDirty}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                </section>

                <section>
                    <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Notifications</h3>
                    <PushNotificationToggle />
                    <p className="py-2 text-small text-fg-muted">
                        Which events send email and in-app notifications is set for everyone by your firm&apos;s admins, in Firm settings › App settings.
                        Your notifications and reminders are in your Inbox.
                    </p>
                </section>

                {/* Export and deletion. In BOTH branches, not only the standalone one: the
                    Personalization page renders this component with `hideChrome`, which returns
                    here — so a card added below the other return was unreachable from the only
                    route that renders the page. */}
                <DataPrivacyCard />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 pb-10 px-4 sm:px-5 md:px-6">
            <Link
                href="/d"
                className="group inline-flex items-center gap-2 text-[0.8125rem] font-medium text-[#45474c] transition-colors hover:text-[#1b1b1d]"
            >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-[#e5e7eb] shadow-sm transition duration-200 group-hover:-translate-x-0.5">
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                </span>
                Back to workspace
            </Link>

            <header className="space-y-1">
                <h1 className="font-headline text-2xl font-bold text-[#1b1b1d]">
                    {profileCopy.pageTitle}
                </h1>
                <p className="text-[0.8125rem] text-[#45474c]">
                    {profileCopy.pageSubtitle}
                </p>
            </header>

            <div className="rounded border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
                <ProfileBubblePopupContent
                    name={displayName}
                    email={email}
                    avatarUrl={avatarUrl}
                    footer={accountForm}
                />
            </div>

            {/* Export and deletion. Below the profile rather than inside it: these act on the
                account as a whole, not on the fields above them, and the privacy policy points
                users here by name. */}
            <DataPrivacyCard />
        </div>
    )
}
