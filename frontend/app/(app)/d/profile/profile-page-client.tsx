'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ProfileBubblePopupContent } from '@/components/ui/profile-bubble-popup'
import { profileCopy } from '@/lib/profile-copy'
import { updateProfileNames } from '@/lib/actions/profile'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
export function ProfilePageClient({
    displayName,
    firstName: initialFirstName,
    lastName: initialLastName,
    email,
    avatarUrl,
}: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    avatarUrl: string | null
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

            <div className="rounded-[2px] border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
                <ProfileBubblePopupContent
                    name={displayName}
                    email={email}
                    avatarUrl={avatarUrl}
                    footer={accountForm}
                />
            </div>
        </div>
    )
}
