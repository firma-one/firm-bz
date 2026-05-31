'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateFirm, deleteFirm } from '@/lib/actions/firms'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Building2, ChevronDown, Check, DollarSign, FileText, FlaskConical, Globe, ImageIcon, ImagePlus, Info, Linkedin, Lock, MapPin, Palette, RotateCcw, Shield, Trash2, Type, Users2, X } from 'lucide-react'
import { contrastRatioAgainstWhite } from '@/lib/color-utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

const WORLD_CURRENCIES: { code: string; symbol: string; label: string }[] = [
    { code: 'USD', symbol: '$',    label: 'USD ($)' },
    { code: 'EUR', symbol: '€',    label: 'EUR (€)' },
    { code: 'GBP', symbol: '£',    label: 'GBP (£)' },
    { code: 'INR', symbol: '₹',    label: 'INR (₹)' },
    { code: 'JPY', symbol: '¥',    label: 'JPY (¥)' },
    { code: 'CNY', symbol: '¥',    label: 'CNY (¥)' },
    { code: 'CAD', symbol: 'CA$',  label: 'CAD (CA$)' },
    { code: 'AUD', symbol: 'A$',   label: 'AUD (A$)' },
    { code: 'SGD', symbol: 'S$',   label: 'SGD (S$)' },
    { code: 'HKD', symbol: 'HK$',  label: 'HKD (HK$)' },
    { code: 'CHF', symbol: 'CHF',  label: 'CHF' },
    { code: 'AED', symbol: 'د.إ',  label: 'AED (د.إ)' },
    { code: 'NZD', symbol: 'NZ$',  label: 'NZD (NZ$)' },
    { code: 'MXN', symbol: 'MX$',  label: 'MXN (MX$)' },
    { code: 'BRL', symbol: 'R$',   label: 'BRL (R$)' },
    { code: 'ZAR', symbol: 'R',    label: 'ZAR (R)' },
    { code: 'KRW', symbol: '₩',    label: 'KRW (₩)' },
    { code: 'NOK', symbol: 'kr',   label: 'NOK (kr)' },
    { code: 'SEK', symbol: 'kr',   label: 'SEK (kr)' },
    { code: 'DKK', symbol: 'kr',   label: 'DKK (kr)' },
    { code: 'THB', symbol: '฿',    label: 'THB (฿)' },
    { code: 'MYR', symbol: 'RM',   label: 'MYR (RM)' },
    { code: 'IDR', symbol: 'Rp',   label: 'IDR (Rp)' },
    { code: 'PHP', symbol: '₱',    label: 'PHP (₱)' },
    { code: 'PKR', symbol: '₨',    label: 'PKR (₨)' },
    { code: 'BDT', symbol: '৳',    label: 'BDT (৳)' },
    { code: 'NGN', symbol: '₦',    label: 'NGN (₦)' },
    { code: 'KES', symbol: 'KSh',  label: 'KES (KSh)' },
]

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
    'live.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com', 'zoho.com',
])

const MAX_LOGO_SIZE = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']

export interface FirmSettingsFormProps {
    orgSlug: string
    orgId?: string | null
    initialName: string
    firmSandboxOnly?: boolean
    onSaved?: () => void
}

export function FirmSettingsForm({
    orgSlug,
    orgId: orgIdProp,
    initialName,
    firmSandboxOnly = false,
    onSaved,
}: FirmSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [orgIdState, setOrgIdState] = useState<string | null>(null)
    const orgId = orgIdProp ?? orgIdState
    const [name, setName] = useState(initialName)
    const [internalMemo, setInternalMemo] = useState('')
    const [industry, setIndustry] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')
    const [companyWebsite, setCompanyWebsite] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [notes, setNotes] = useState('')
    const [logoUrl, setLogoUrl] = useState('')
    const [subtext, setSubtext] = useState('')
    const [website, setWebsite] = useState('')
    const [themeColor, setThemeColor] = useState('')
    const [secondaryColor, setSecondaryColor] = useState('')
    const [currencyOpen, setCurrencyOpen] = useState(false)
    const [currencyCode, setCurrencyCode] = useState('')
    const [currencyIsCustom, setCurrencyIsCustom] = useState(false)
    const [currencyCustom, setCurrencyCustom] = useState('')
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
    const [logoScale, setLogoScale] = useState(1)
    const [logoX, setLogoX] = useState(0)
    const [logoY, setLogoY] = useState(0)
    const [logoAspectRatio, setLogoAspectRatio] = useState<'1:1' | '4:3' | '16:9'>('1:1')
    const [enableBetaFeatures, setEnableBetaFeatures] = useState(false)
    const [allowDomainAccess, setAllowDomainAccess] = useState(false)
    const [allowedEmailDomain, setAllowedEmailDomain] = useState('')
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [dangerOpen, setDangerOpen] = useState(false)
    const [brandingLoaded, setBrandingLoaded] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })

    useEffect(() => { setName(initialName) }, [initialName])

    useEffect(() => {
        let cancelled = false
        const loadBranding = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) return
                const res = await fetch(`/api/firm?slug=${encodeURIComponent(orgSlug)}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                })
                if (!res.ok || cancelled) return
                const data = await res.json()
                const firm = data.firm ?? data
                if (!cancelled && firm?.id) setOrgIdState(firm.id)
                const settings = (firm?.settings as Record<string, unknown>) ?? {}
                const b = (settings.branding as Record<string, string | undefined>) ?? {}
                const c = (settings.currency as Record<string, string | undefined>) ?? {}
                if (!cancelled) {
                    // Read exclusively from settings.branding
                    setLogoUrl(b.logoUrl ?? '')
                    const ar = b.logoAspectRatio as string | undefined
                    setLogoAspectRatio(ar === '4:3' || ar === '16:9' ? ar : '1:1')
                    setSubtext(b.subtext ?? '')
                    setWebsite(b.website ?? '')
                    setThemeColor(b.primaryColor ?? '')
                    setSecondaryColor(b.secondaryColor ?? '')
                    setInternalMemo((settings.internalMemo as string) ?? '')
                    setIndustry((settings.industry as string) ?? '')
                    setCompanySizeBracket((settings.companySizeBracket as string) ?? '')
                    setCompanyWebsite((settings.companyWebsite as string) ?? '')
                    setLinkedInUrl((settings.linkedInUrl as string) ?? '')
                    setBillingAddress((settings.billingAddress as string) ?? '')
                    setNotes((settings.notes as string) ?? '')
                    setEnableBetaFeatures(settings.enableBetaFeatures === true)
                    setAllowDomainAccess(firm.allowDomainAccess === true)
                    setAllowedEmailDomain(firm.allowedEmailDomain ?? '')
                    const savedCode = c.code ?? ''
                    const savedSymbol = c.symbol ?? ''
                    const knownMatch = WORLD_CURRENCIES.find((cur) => cur.code === savedCode)
                    if (knownMatch) {
                        setCurrencyCode(savedCode)
                        setCurrencyIsCustom(false)
                        setCurrencyCustom('')
                    } else if (savedSymbol) {
                        setCurrencyCode('')
                        setCurrencyIsCustom(true)
                        setCurrencyCustom(savedSymbol)
                    }
                }
            } catch { /* ignore */ } finally {
                if (!cancelled) setBrandingLoaded(true)
            }
        }
        loadBranding()
        return () => { cancelled = true }
    }, [orgSlug])

    useEffect(() => {
        if (!logoFile) return
        const url = URL.createObjectURL(logoFile)
        setLogoPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [logoFile])

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) { setLogoFile(null); return }
        const type = file.type?.toLowerCase()
        if (!ALLOWED_LOGO_TYPES.includes(type)) {
            addToast({ type: 'error', title: 'Invalid file', message: 'Use JPG, PNG, or SVG.' })
            return
        }
        if (file.size > MAX_LOGO_SIZE) {
            addToast({ type: 'error', title: 'File too large', message: 'Logo must be under 5 MB.' })
            return
        }
        setLogoFile(file)
        setLogoScale(1)
        setLogoX(0)
        setLogoY(0)
    }

    const hasLogoAdjustment = logoScale !== 1 || logoX !== 0 || logoY !== 0
    const isRasterLogo = logoFile?.type === 'image/png' || logoFile?.type === 'image/jpeg' || logoFile?.type === 'image/jpg'

    const onPreviewPointerDown = (e: React.PointerEvent) => {
        if (!(logoPreviewUrl || logoUrl)) return
        e.preventDefault()
        dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, startLogoX: logoX, startLogoY: logoY }
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onPreviewPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current.isDragging) return
        setLogoX(dragRef.current.startLogoX + (e.clientX - dragRef.current.startX))
        setLogoY(dragRef.current.startLogoY + (e.clientY - dragRef.current.startY))
    }
    const onPreviewPointerUp = (e: React.PointerEvent) => {
        if (dragRef.current.isDragging) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        dragRef.current.isDragging = false
    }

    const exportLogoToBlob = (): Promise<Blob | null> => {
        if (!logoPreviewUrl || !isRasterLogo) return Promise.resolve(null)
        return new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = exportW
                canvas.height = exportH
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }
                const scaleToFit = Math.min(exportW / img.naturalWidth, exportH / img.naturalHeight)
                const w = img.naturalWidth * scaleToFit
                const h = img.naturalHeight * scaleToFit
                const scaleX = exportW / previewW
                const scaleY = exportH / PREVIEW_H
                ctx.save()
                ctx.translate(logoX * scaleX, logoY * scaleY)
                ctx.translate(exportW / 2, exportH / 2)
                ctx.scale(logoScale, logoScale)
                ctx.translate(-exportW / 2, -exportH / 2)
                ctx.drawImage(img, (exportW - w) / 2, (exportH - h) / 2, w, h)
                ctx.restore()
                canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95)
            }
            img.onerror = () => resolve(null)
            img.src = logoPreviewUrl
        })
    }

    const isPublicDomain = allowedEmailDomain && PUBLIC_EMAIL_DOMAINS.has(allowedEmailDomain.toLowerCase())

    const PREVIEW_H = 160
    const aspectMap = { '1:1': 1, '4:3': 4/3, '16:9': 16/9 } as const
    const previewW = Math.round(PREVIEW_H * aspectMap[logoAspectRatio])
    const exportH = 400
    const exportW = Math.round(exportH * aspectMap[logoAspectRatio])

    const handleSave = async () => {
        if (isSandboxFirm) return
        if (!name.trim()) {
            addToast({ type: 'error', title: 'Required', message: 'Firm name is required.' })
            return
        }
        setSaving(true)
        try {
            let resolvedLogoUrl = logoUrl
            if (logoFile && orgId) {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) throw new Error('Not authenticated')
                const formData = new FormData()
                const fileToUpload =
                    isRasterLogo && hasLogoAdjustment
                        ? await exportLogoToBlob().then((blob) => (blob ? new File([blob], 'logo.png', { type: 'image/png' }) : logoFile))
                        : logoFile
                if (!fileToUpload) throw new Error('No file to upload')
                formData.set('file', fileToUpload)
                const uploadRes = await fetch(`/api/firms/${orgId}/logo`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    body: formData,
                })
                if (!uploadRes.ok) {
                    const err = await uploadRes.json().catch(() => ({}))
                    throw new Error((err as { error?: string }).error ?? 'Logo upload failed')
                }
                const { logoUrl: uploadedUrl } = await uploadRes.json()
                resolvedLogoUrl = uploadedUrl ?? resolvedLogoUrl
                setLogoUrl(resolvedLogoUrl)
                setLogoFile(null)
                setLogoScale(1)
                setLogoX(0)
                setLogoY(0)
            }
            await updateFirm(orgSlug, {
                name,
                branding: {
                    logoUrl: resolvedLogoUrl || null,
                    logoAspectRatio: logoAspectRatio,
                    subtext: subtext || null,
                    website: website.trim() || null,
                    primaryColor: themeColor || null,
                    secondaryColor: secondaryColor || null,
                },
                currency: currencyIsCustom
                    ? { symbol: currencyCustom.trim() || null, code: null }
                    : currencyCode
                        ? { symbol: WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? null, code: currencyCode }
                        : { symbol: null, code: null },
                enableBetaFeatures,
                internalMemo: internalMemo.trim() || null,
                industry: industry.trim() || null,
                companySizeBracket: companySizeBracket || null,
                companyWebsite: companyWebsite.trim() || null,
                linkedInUrl: linkedInUrl.trim() || null,
                billingAddress: billingAddress.trim() || null,
                notes: notes.trim() || null,
                allowDomainAccess: allowDomainAccess && !!allowedEmailDomain.trim(),
                allowedEmailDomain: allowDomainAccess ? (allowedEmailDomain.trim() || null) : null,
            })
            addToast({ type: 'success', title: 'Saved', message: 'Firm details updated.' })
            if (typeof window !== 'undefined') {
                await new Promise<void>((resolve) => {
                    const handler = () => { window.removeEventListener('firma-branding-reloaded', handler); resolve() }
                    window.addEventListener('firma-branding-reloaded', handler)
                    window.dispatchEvent(new CustomEvent('firm-branding-updated'))
                    setTimeout(resolve, 1500)
                })
            }
            onSaved?.()
        } catch (e: unknown) {
            addToast({
                type: 'error',
                title: 'Update failed',
                message: e instanceof Error ? e.message : 'Could not update firm.',
            })
        } finally {
            setSaving(false)
        }
    }

    const handleRemoveLogo = async () => {
        if (isSandboxFirm || !orgId) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) throw new Error('Not authenticated')
            const res = await fetch(`/api/firms/${orgId}/logo`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` },
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error((err as { error?: string }).error ?? 'Failed to remove logo')
            }
            setLogoUrl('')
            setLogoFile(null)
            setLogoPreviewUrl(null)
            setLogoScale(1)
            setLogoX(0)
            setLogoY(0)
            addToast({ type: 'success', title: 'Logo removed', message: 'Organization logo has been removed.' })
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Remove logo failed', message: e instanceof Error ? e.message : 'Could not remove logo.' })
        }
    }

    const performDeleteFirm = async () => {
        if (isSandboxFirm) return
        setDeleting(true)
        try {
            await deleteFirm(orgSlug)
            addToast({ type: 'success', title: 'Organization deleted', message: 'Organization has been removed.' })
            setDeleteConfirmOpen(false)
            onSaved?.()
            router.push('/d')
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Could not delete firm.' })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {isSandboxFirm && <SandboxInfoBanner />}

                {/* Tile grid */}
                <div className="grid grid-cols-3 gap-3">

                    {/* LEFT COLUMN — Identity + Domain Access + Regional + Features */}
                    <div className="col-span-1 flex flex-col gap-3 h-full">

                    {/* IDENTITY */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className={fieldLabel}>Identity</p>

                        {/* Firm name */}
                        <div>
                            <label htmlFor="org-name" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Firm name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                            </label>
                            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Firm name" disabled={isSandboxFirm} className={inputCls} />
                        </div>

                        {/* Internal memo */}
                        <div>
                            <label htmlFor="org-internal-memo" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Internal memo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— internal only</span></span>
                            </label>
                            <textarea id="org-internal-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)} placeholder="Private notes, context about this firm…" rows={2} disabled={isSandboxFirm} className={textareaCls} />
                        </div>
                    </div>

                    {/* DOMAIN ACCESS */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className={fieldLabel}><span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Domain access</span></p>
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="allow-domain" className="text-xs text-[#1b1b1d] cursor-pointer">
                                Enable access for <span className="font-semibold">{allowedEmailDomain || 'your domain'}</span>
                                <span className="block text-[#9a9ba0] font-normal mt-0.5">Users with this email domain can join without an invitation.</span>
                            </Label>
                            <Switch
                                id="allow-domain"
                                checked={allowDomainAccess}
                                onCheckedChange={setAllowDomainAccess}
                                disabled={isSandboxFirm || !brandingLoaded}
                            />
                        </div>
                        {allowDomainAccess && (
                            <div>
                                <label htmlFor="allowed-email-domain" className={fieldLabel}>
                                    <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Email domain</span>
                                </label>
                                <Input
                                    id="allowed-email-domain"
                                    value={allowedEmailDomain}
                                    onChange={(e) => setAllowedEmailDomain(e.target.value)}
                                    placeholder="e.g. acme.com"
                                    disabled={isSandboxFirm}
                                    className={`font-mono ${inputCls}`}
                                />
                                {isPublicDomain && (
                                    <p className="mt-1 text-[10px] text-amber-600">Public email domains (e.g. gmail.com) are not recommended for firm access.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* REGIONAL */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className={fieldLabel}>Regional</p>
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> Currency <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                            </label>
                            <div className="relative w-full mt-1">
                                <DropdownMenu open={currencyOpen} onOpenChange={setCurrencyOpen}>
                                    <DropdownMenuTrigger asChild disabled={isSandboxFirm}>
                                        <button className="w-full h-9 flex items-center rounded border border-[#e5e7eb] bg-white px-3 pr-7 text-xs text-[#1b1b1d] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                                            <span className={`flex-1 text-left truncate ${currencyCode || (currencyIsCustom && currencyCustom) ? 'text-[#1b1b1d]' : 'text-[#9a9ba0]'}`}>
                                                {currencyCode
                                                    ? WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.label ?? currencyCode
                                                    : currencyIsCustom && currencyCustom ? `Other: ${currencyCustom}` : 'Select…'}
                                            </span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                                        {(currencyCode || (currencyIsCustom && currencyCustom)) && !isSandboxFirm ? (
                                            <button type="button" className="pointer-events-auto p-0.5 rounded text-[#9a9ba0] hover:text-[#1b1b1d] hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom('') }} aria-label="Clear">
                                                <X className="h-3 w-3" />
                                            </button>
                                        ) : (
                                            <ChevronDown className="h-3 w-3 text-[#45474c]" />
                                        )}
                                    </div>
                                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1 max-h-72 overflow-y-auto rounded" onCloseAutoFocus={(e) => e.preventDefault()}>
                                        {(currencyCode || currencyIsCustom) && (
                                            <>
                                                <DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-sm rounded text-[#45474c] hover:text-red-600" onSelect={() => { setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false) }}>
                                                    <span className="text-[#9a9ba0]">×</span> Clear selection
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        {WORLD_CURRENCIES.map((cur) => (
                                            <DropdownMenuItem key={cur.code} className="flex items-center justify-between cursor-pointer text-sm rounded" onSelect={() => { setCurrencyCode(cur.code); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false) }}>
                                                {cur.label}
                                                {currencyCode === cur.code && !currencyIsCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <div className="px-2 py-1.5 flex items-center gap-2">
                                            <input value={currencyIsCustom ? currencyCustom : ''} onChange={(e) => { setCurrencyCustom(e.target.value); setCurrencyIsCustom(true); setCurrencyCode('') }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setCurrencyOpen(false) }} onClick={(e) => e.stopPropagation()} placeholder="Other (enter symbol)…" className="flex-1 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] outline-none bg-transparent" />
                                            {currencyIsCustom && currencyCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <p className="mt-1 text-xs text-[#9a9ba0]">Prefix on contract values.</p>
                        </div>
                    </div>

                    {/* FEATURES */}
                    <div className="flex-1 bg-white rounded border border-[#e5e7eb] p-4">
                        <p className={`${fieldLabel} mb-3`}>Features</p>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-start gap-2.5">
                                <FlaskConical className="h-4 w-4 text-[#45474c] mt-0.5 shrink-0" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-[#1b1b1d]">Beta features</span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 leading-none">Beta</span>
                                    </div>
                                    <p className="text-xs text-[#45474c] mt-0.5">Enables <strong>Dossier</strong> and <strong>Board</strong>. Internal personas only.</p>
                                </div>
                            </div>
                            <Switch checked={enableBetaFeatures} onCheckedChange={setEnableBetaFeatures}
                                disabled={isSandboxFirm || !brandingLoaded} aria-label="Enable beta features" />
                        </div>
                    </div>

                    </div>{/* end LEFT COLUMN */}

                    {/* COMPANY — col-span-1 */}
                    <div className="col-span-1 bg-white rounded border border-[#e5e7eb] p-4 flex flex-col gap-3 h-full">
                        <p className={`${fieldLabel} shrink-0`}>Company</p>

                        {/* Industry */}
                        <div className="shrink-0">
                            <label htmlFor="firm-industry" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span>
                            </label>
                            <Input id="firm-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Technology" disabled={isSandboxFirm} className={inputCls} />
                        </div>

                        {/* Company size */}
                        <div className="shrink-0">
                            <label htmlFor="firm-company-size" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span>
                            </label>
                            <SelectWithCustomEntry id="firm-company-size" value={companySizeBracket} onChange={setCompanySizeBracket} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…" customEntryHint="Custom…" disabled={isSandboxFirm} />
                        </div>

                        {/* Website */}
                        <div className="shrink-0">
                            <label htmlFor="firm-company-website" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span>
                            </label>
                            <Input id="firm-company-website" type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="https://…" disabled={isSandboxFirm} className={inputCls} />
                        </div>

                        {/* LinkedIn */}
                        <div className="shrink-0">
                            <label htmlFor="firm-linkedin" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span>
                            </label>
                            <Input id="firm-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/company/…" disabled={isSandboxFirm} className={inputCls} />
                        </div>

                        {/* Billing address */}
                        <div className="flex flex-col flex-1">
                            <label htmlFor="firm-billing-address" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span>
                            </label>
                            <textarea id="firm-billing-address" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} disabled={isSandboxFirm} className={`${textareaCls} flex-1 resize-none`} />
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col flex-1">
                            <label htmlFor="firm-notes" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span>
                            </label>
                            <textarea id="firm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details about the firm" disabled={isSandboxFirm} className={`${textareaCls} flex-1 resize-none`} />
                        </div>
                    </div>

                    {/* BRANDING — col-span-1 */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3 h-full">
                        <div className="flex items-center justify-between">
                            <p className={fieldLabel}>Branding</p>
                            {(themeColor || secondaryColor) && !isSandboxFirm && (
                                <button type="button" onClick={() => { setThemeColor(''); setSecondaryColor('') }}
                                    className="inline-flex items-center gap-1 text-[10px] font-medium text-firma hover:text-firma/80 transition-colors"
                                    aria-label="Reset to Firma theme">
                                    <RotateCcw className="h-3 w-3" /> Reset colors
                                </button>
                            )}
                        </div>

                        {/* Brand Tagline */}
                        <div>
                            <label htmlFor="org-subtext" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Type className="h-3 w-3" /> Brand tagline <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                            </label>
                            <Input id="org-subtext" value={subtext} onChange={(e) => setSubtext(e.target.value)} placeholder="Optional tagline or subtext" disabled={isSandboxFirm} className={inputCls} />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="org-logo" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Logo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                            </label>
                            {/* Aspect ratio picker */}
                            <div className="flex items-center gap-1.5">
                                {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                    const dims = { '1:1': [16, 16], '4:3': [21, 16], '16:9': [28, 16] }
                                    const [w, h] = dims[ar]
                                    const active = logoAspectRatio === ar
                                    return (
                                        <button
                                            key={ar}
                                            type="button"
                                            onClick={() => { setLogoAspectRatio(ar); setLogoScale(1); setLogoX(0); setLogoY(0) }}
                                            disabled={isSandboxFirm}
                                            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded border transition-colors disabled:opacity-50 ${active ? 'border-primary bg-primary/5 text-primary' : 'border-[#e5e7eb] text-[#9a9ba0] hover:border-[#45474c] hover:text-[#45474c]'}`}
                                            aria-label={`${ar} aspect ratio`}
                                            aria-pressed={active}
                                        >
                                            <span
                                                className={`block rounded-sm border-2 ${active ? 'border-primary' : 'border-current'}`}
                                                style={{ width: w, height: h }}
                                            />
                                            <span className="text-[9px] font-mono font-bold tracking-wide leading-none">{ar}</span>
                                        </button>
                                    )
                                })}
                            </div>
                            <p className="text-xs text-[#9a9ba0]">JPG, PNG or SVG. Max 5 MB.</p>
                            <input
                                ref={fileInputRef}
                                id="org-logo"
                                type="file"
                                accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                                onChange={handleLogoFileChange}
                                className="sr-only"
                                aria-hidden
                            />
                            <TooltipProvider delayDuration={300}>
                                {!brandingLoaded ? (
                                    <div className="flex shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]"
                                        style={{ width: previewW, height: PREVIEW_H }}>
                                        <svg className="animate-spin h-5 w-5 text-[#9a9ba0]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    </div>
                                ) : !(logoPreviewUrl || logoUrl) ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative flex shrink-0 items-center justify-center rounded border-2 border-dashed border-[#e5e7eb] bg-slate-50 hover:border-primary/40 transition-colors focus:outline-none group"
                                        style={{ width: previewW, height: PREVIEW_H }}
                                        aria-label="Upload logo"
                                    >
                                        <span className="text-5xl font-semibold text-slate-300 select-none group-hover:opacity-30 transition-opacity">
                                            {name.trim().charAt(0).toUpperCase() || '?'}
                                        </span>
                                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ImagePlus className="h-6 w-6 text-primary" />
                                            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Upload logo</span>
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className={`relative flex shrink-0 rounded border border-[#e5e7eb] overflow-hidden select-none group ${!isSandboxFirm ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                            style={{ width: previewW, height: PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                            title="Drag to reposition, use slider to zoom."
                                            {...(!isSandboxFirm
                                                ? { onPointerDown: onPreviewPointerDown, onPointerMove: onPreviewPointerMove, onPointerUp: onPreviewPointerUp, onPointerLeave: onPreviewPointerUp }
                                                : {})}
                                        >
                                            <div className="absolute inset-0 flex items-center justify-center"
                                                style={{ transform: `translate(${logoX}px, ${logoY}px) scale(${logoScale})` }}>
                                                <img src={logoPreviewUrl || logoUrl || undefined} alt="Logo preview"
                                                    className="max-w-full max-h-full object-contain pointer-events-none"
                                                    style={{ width: previewW, height: PREVIEW_H }} draggable={false} />
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button type="button" onClick={() => !isSandboxFirm && fileInputRef.current?.click()}
                                                            disabled={isSandboxFirm} className="p-2 rounded bg-white text-[#1b1b1d] hover:bg-[#f9f9fb] shadow-sm disabled:opacity-50" aria-label="Replace logo">
                                                            <ImagePlus className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Replace</TooltipContent>
                                                </Tooltip>
                                                {orgId && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button type="button" onClick={handleRemoveLogo} disabled={isSandboxFirm}
                                                                className="p-2 rounded bg-white text-red-600 hover:bg-red-50 shadow-sm disabled:opacity-50" aria-label="Remove logo">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Remove</TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </div>
                                        {(logoPreviewUrl || (brandingLoaded && logoUrl)) && (
                                            <div className="flex flex-col gap-1" style={{ maxWidth: previewW, width: '100%' }}>
                                                <input
                                                    type="range" min={-1} max={1} step={0.04}
                                                    value={logoScale <= 1 ? (logoScale - 1) / 0.5 : (logoScale - 1) / 2}
                                                    onChange={(e) => {
                                                        const v = Number(e.target.value)
                                                        setLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2)
                                                    }}
                                                    disabled={isSandboxFirm}
                                                    className="w-full h-1.5 rounded appearance-none bg-[#e5e7eb] accent-primary disabled:opacity-60"
                                                />
                                                <div className="flex items-center justify-between px-0.5">
                                                    <button type="button" onClick={() => setLogoScale(Math.max(0.5, logoScale - 0.1))} disabled={isSandboxFirm} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none disabled:opacity-50" aria-label="Zoom out">−</button>
                                                    <button type="button" onClick={() => { setLogoScale(1); setLogoX(0); setLogoY(0) }} disabled={isSandboxFirm || (logoScale === 1 && logoX === 0 && logoY === 0)} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors disabled:opacity-30 disabled:cursor-default" aria-label="Reset zoom"><RotateCcw className="h-3 w-3" /></button>
                                                    <button type="button" onClick={() => setLogoScale(Math.min(3, logoScale + 0.1))} disabled={isSandboxFirm} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none disabled:opacity-50" aria-label="Zoom in">+</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </TooltipProvider>
                        </div>
                        {/* Brand Primary Color */}
                        <div className="space-y-1.5">
                            <label htmlFor="org-primary-color" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand primary color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input id="org-primary-color" type="color"
                                    value={themeColor || '#069668'}
                                    onChange={(e) => setThemeColor(e.target.value)} disabled={isSandboxFirm}
                                    className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)}
                                    placeholder="Leave empty to use Firma default (#069668)"
                                    disabled={isSandboxFirm}
                                    className={`font-mono ${inputCls}`} />
                                <button type="button" onClick={() => setThemeColor('')} disabled={!themeColor || isSandboxFirm} className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default" aria-label="Clear primary color">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            {themeColor && /^#[0-9A-Fa-f]{6}$/.test(themeColor) && contrastRatioAgainstWhite(themeColor) < 3 && (
                                <p className="flex items-center gap-1 text-xs text-amber-600">
                                    <Info className="h-3 w-3 shrink-0" />
                                    Low contrast against white ({contrastRatioAgainstWhite(themeColor)}:1). Text may be hard to read.
                                </p>
                            )}
                        </div>

                        {/* Brand Accent Color */}
                        <div className="space-y-1.5">
                            <label htmlFor="org-accent-color" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand accent color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                            </label>
                            <p className="text-[11px] text-[#9a9ba0]">Used for nav stripe &amp; tab underlines. Leave empty to match primary.</p>
                            <div className="flex items-center gap-2">
                                <div className="relative h-9 w-10 shrink-0">
                                    <input id="org-accent-color" type="color"
                                        value={secondaryColor || '#ffffff'}
                                        onChange={(e) => setSecondaryColor(e.target.value)} disabled={isSandboxFirm}
                                        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                    <div className="h-9 w-10 rounded border border-[#e5e7eb] pointer-events-none"
                                        style={secondaryColor ? { backgroundColor: secondaryColor } : { background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, white 2px, white 6px)' }} />
                                </div>
                                <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                                    placeholder="Leave empty to match primary color"
                                    disabled={isSandboxFirm}
                                    className={`font-mono ${inputCls}`} />
                                <button type="button" onClick={() => setSecondaryColor('')} disabled={!secondaryColor || isSandboxFirm} className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default" aria-label="Clear accent color">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Header preview */}
                        <div className="mt-1">
                            <p className={`${fieldLabel} mb-2`}>Header preview</p>
                            <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3 flex items-center gap-3">
                                {/* Logo slot — mirrors topbar: fixed h-10, width grows with aspect ratio */}
                                {(logoPreviewUrl || logoUrl) ? (() => {
                                    const displayH = 40
                                    const displayW = Math.round(displayH * aspectMap[logoAspectRatio])
                                    const scale = displayH / PREVIEW_H
                                    return (
                                        <div className="relative shrink-0 rounded-lg bg-slate-50 border-2 border-slate-100 overflow-hidden"
                                            style={{ width: displayW, height: displayH }}>
                                            <div className="absolute inset-0 flex items-center justify-center"
                                                style={{
                                                    transform: `translate(${logoX * scale}px, ${logoY * scale}px) scale(${logoScale})`,
                                                    transformOrigin: 'center',
                                                }}>
                                                <img
                                                    src={logoPreviewUrl || logoUrl || ''}
                                                    alt="Logo preview"
                                                    className="object-contain pointer-events-none"
                                                    style={{ width: displayW, height: displayH }}
                                                    draggable={false}
                                                />
                                            </div>
                                        </div>
                                    )
                                })() : (
                                    <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-50 border-2 border-slate-100 h-10 w-10 text-lg font-semibold"
                                        style={{ color: themeColor || '#069668' }}>
                                        {(name || '?').trim().charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="flex flex-col justify-center min-w-0">
                                    <span className="font-headline text-xl font-bold tracking-tighter text-[#1b1b1d] truncate leading-tight">
                                        {name || 'Firm name'}
                                    </span>
                                    {subtext && <span className="text-[11px] text-gray-500 truncate mt-0.5">{subtext}</span>}
                                </div>
                            </div>
                        </div>

                    </div>

                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase"
                        onClick={() => router.push(`/d/f/${orgSlug}?tab=clients`)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="greenCta" onClick={handleSave}
                        disabled={isSandboxFirm || saving || !brandingLoaded}
                        className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>

            {/* Danger zone — collapsed by default */}
            <section className="border border-red-200 rounded overflow-hidden">
                <button
                    type="button"
                    onClick={() => setDangerOpen((v) => !v)}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 bg-red-50/60 hover:bg-red-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-800">Danger zone</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-red-500 transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                </button>
                {dangerOpen && (
                    <div className="p-5 border-t border-red-200 bg-red-50/40">
                        <p className="text-sm text-[#45474c] mb-4">
                            Permanently delete this firm. All clients, projects, and members will be removed. This cannot be undone.
                        </p>
                        <Button
                            type="button"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={isSandboxFirm || deleting}
                            className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase shadow-sm hover:shadow-[0_4px_12px_-2px_rgba(185,28,28,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all"
                        >
                            {deleting ? 'Deleting…' : 'Delete firm'}
                        </Button>
                    </div>
                )}
            </section>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-[440px] rounded">
                    <DialogHeader>
                        <DialogTitle>Delete firm?</DialogTitle>
                        <DialogDescription className="text-[#45474c]">
                            Permanently delete this organization? All clients, projects, and members will be removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded border-[#e5e7eb]"
                            disabled={deleting}
                            onClick={() => setDeleteConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={isSandboxFirm || deleting}
                            onClick={() => void performDeleteFirm()}
                        >
                            {deleting ? 'Deleting…' : 'Delete firm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
