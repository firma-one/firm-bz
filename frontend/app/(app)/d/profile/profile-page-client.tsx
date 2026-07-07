'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Mail, User } from 'lucide-react'
import { ProfileBubblePopupContent } from '@/components/ui/profile-bubble-popup'
import { profileCopy } from '@/lib/profile-copy'
import { updateProfileNames } from '@/lib/actions/profile'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50'
export function ProfilePageClient({
    displayName,
    firstName: initialFirstName,
    lastName: initialLastName,
    email,
    avatarUrl,
    hideChrome = false,
}: {
    displayName: string
    firstName: string
    lastName: string
    email: string
    avatarUrl: string | null
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
        const initials = displayName
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()

        return (
            <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">

                    {/* Identity — col-span-2 */}
                    <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className={fieldLabel}>Identity</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="profile-first-name" className={fieldLabel}>First name</label>
                                <Input
                                    id="profile-first-name"
                                    autoComplete="given-name"
                                    maxLength={80}
                                    value={firstName}
                                    onChange={(e) => { setFirstName(e.target.value); setFormError(null) }}
                                    disabled={saving}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="profile-last-name" className={fieldLabel}>Last name</label>
                                <Input
                                    id="profile-last-name"
                                    autoComplete="family-name"
                                    maxLength={80}
                                    value={lastName}
                                    onChange={(e) => { setLastName(e.target.value); setFormError(null) }}
                                    disabled={saving}
                                    className={inputCls}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={email}
                                    readOnly
                                    disabled
                                    className={`${inputCls} flex-1`}
                                />
                                <button
                                    type="button"
                                    title="Copy email"
                                    onClick={() => navigator.clipboard.writeText(email)}
                                    className="shrink-0 p-2 rounded border border-[#e5e7eb] bg-white text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f9f9fb] transition-colors"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">Email cannot be changed here.</p>
                        </div>
                        {formError && (
                            <p className="text-xs text-red-600" role="alert">{formError}</p>
                        )}
                    </div>

                    {/* Account summary — col-span-1 */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-4">
                        <p className={fieldLabel}>Account</p>
                        <div className="flex flex-col items-center gap-3 py-2">
                            {avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarUrl} alt={displayName} className="h-14 w-14 rounded-full object-cover border border-[#e5e7eb]" />
                            ) : (
                                <div className="h-14 w-14 rounded-full bg-primary/10 border border-[#e5e7eb] flex items-center justify-center">
                                    <span className="font-headline text-lg font-bold text-primary">{initials || <User className="h-6 w-6" />}</span>
                                </div>
                            )}
                            <div className="text-center">
                                <p className="text-[0.8125rem] font-semibold text-[#1b1b1d] leading-tight">{displayName}</p>
                                <p className="text-xs text-[#45474c] truncate max-w-[160px]">{email}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions bar */}
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        onClick={handleSaveName}
                        disabled={saving || !isDirty}
                        variant="greenCta"
                        className="rounded min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
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
        </div>
    )
}
