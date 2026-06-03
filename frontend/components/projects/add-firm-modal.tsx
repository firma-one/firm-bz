'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Building2, Check, DollarSign, FileText, Globe, ImageIcon, ImagePlus, Info, Linkedin, Lock, MapPin, Palette, RotateCcw, Shield, SquarePlus, Trash2, Type, Users2 } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SelectWithCustomEntry } from "@/components/ui/select-with-custom-entry"
import { createFirm, updateFirm } from '@/lib/actions/firms'
import { useAuth } from '@/lib/auth-context'
import { useCanCreateAdditionalFirm } from '@/lib/hooks/use-can-create-additional-firm'
import { buildAppBillingHref } from '@/lib/billing/billing-links'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import { supabase } from '@/lib/supabase'
import { contrastRatioAgainstWhite } from '@/lib/color-utils'
import { FIRMA_COLOR } from '@/config/brand'

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
    'live.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com', 'zoho.com',
])

const WORLD_CURRENCIES = [
    { code: 'USD', symbol: '$', label: 'USD ($)' }, { code: 'EUR', symbol: '€', label: 'EUR (€)' },
    { code: 'GBP', symbol: '£', label: 'GBP (£)' }, { code: 'INR', symbol: '₹', label: 'INR (₹)' },
    { code: 'JPY', symbol: '¥', label: 'JPY (¥)' }, { code: 'CAD', symbol: 'CA$', label: 'CAD (CA$)' },
    { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' }, { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
    { code: 'AED', symbol: 'د.إ', label: 'AED (د.إ)' }, { code: 'CHF', symbol: 'CHF', label: 'CHF' },
]

const MAX_LOGO_SIZE = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']
const PREVIEW_H = 160
const aspectMap = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 } as const

interface AddFirmModalProps {
    trigger?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function AddFirmModal({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: AddFirmModalProps) {
    const { user } = useAuth()
    const { canCreateAdditionalFirm, loadingEntitlement } = useCanCreateAdditionalFirm(user?.id)
    const addDisabled = !user?.id || loadingEntitlement || !canCreateAdditionalFirm
    const showUpgradeHint = Boolean(user?.id) && !loadingEntitlement && !canCreateAdditionalFirm

    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange as (open: boolean) => void) : setInternalOpen

    // Phase: 'create' = before DB call, 'branding' = firm exists, editing branding
    const [phase, setPhase] = useState<'create' | 'branding'>('create')
    const [creating, setCreating] = useState(false) // spinner on CREATE button
    const [saving, setSaving] = useState(false)      // spinner on SAVE button
    const [error, setError] = useState<string | null>(null)

    // Created firm (populated after CREATE succeeds)
    const [firmId, setFirmId] = useState<string | null>(null)
    const [firmSlug, setFirmSlug] = useState<string | null>(null)

    // Identity
    const [name, setName] = useState('')
    const [internalMemo, setInternalMemo] = useState('')

    // Domain Access
    const [allowDomainAccess, setAllowDomainAccess] = useState(true)
    const [allowedEmailDomain, setAllowedEmailDomain] = useState('')

    // Company
    const [industry, setIndustry] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')
    const [companyWebsite, setCompanyWebsite] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [notes, setNotes] = useState('')

    // Regional
    const [currencyCode, setCurrencyCode] = useState('')

    // Branding — colors (available in both phases)
    const [subtext, setSubtext] = useState('')
    const [themeColor, setThemeColor] = useState('')
    const [secondaryColor, setSecondaryColor] = useState('')

    // Branding — logo (only in branding phase)
    const [logoUrl, setLogoUrl] = useState('')
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
    const [logoScale, setLogoScale] = useState(1)
    const [logoX, setLogoX] = useState(0)
    const [logoY, setLogoY] = useState(0)
    const [logoAspectRatio, setLogoAspectRatio] = useState<'1:1' | '4:3' | '16:9'>('1:1')

    const fileInputRef = useRef<HTMLInputElement>(null)
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })

    const previewW = Math.round(PREVIEW_H * aspectMap[logoAspectRatio])
    const exportH = 400
    const exportW = Math.round(exportH * aspectMap[logoAspectRatio])
    const isRasterLogo = logoFile?.type === 'image/png' || logoFile?.type === 'image/jpeg' || logoFile?.type === 'image/jpg'
    const hasLogoAdjustment = logoScale !== 1 || logoX !== 0 || logoY !== 0

    const router = useRouter()
    const pathname = usePathname()
    const billingHref = (() => {
        const m = pathname?.match(/\/d\/(?:f|o)\/([^/]+)/)
        const slug = m?.[1]
        if (!slug) return `/d/billing?returnTo=%2Fd%2Ff%2F`
        const returnPath = validateCheckoutReturnTo(pathname ?? null) ?? `/d/f/${slug}`
        return buildAppBillingHref({ firmSlug: slug, returnPath })
    })()

    useEffect(() => {
        if (open && user?.email) {
            const domain = user.email.split('@')[1]?.toLowerCase() || ''
            if (domain) setAllowedEmailDomain((prev) => prev || domain)
        }
    }, [open, user?.email])

    useEffect(() => {
        if (!isControlled) return
        if (open && addDisabled && !creating) setOpen(false)
    }, [isControlled, open, addDisabled, creating, setOpen])

    useEffect(() => {
        if (!logoFile) return
        const url = URL.createObjectURL(logoFile)
        setLogoPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [logoFile])

    const isPublicDomain = allowedEmailDomain && PUBLIC_EMAIL_DOMAINS.has(allowedEmailDomain.toLowerCase())
    const isFormDisabled = creating || saving

    const resetForm = () => {
        setPhase('create'); setError(null)
        setFirmId(null); setFirmSlug(null)
        setName(''); setInternalMemo('')
        setAllowDomainAccess(true); setAllowedEmailDomain('')
        setIndustry(''); setCompanySizeBracket(''); setCompanyWebsite('')
        setLinkedInUrl(''); setBillingAddress(''); setNotes('')
        setCurrencyCode('')
        setSubtext(''); setThemeColor(''); setSecondaryColor('')
        setLogoUrl(''); setLogoFile(null); setLogoPreviewUrl(null)
        setLogoScale(1); setLogoX(0); setLogoY(0); setLogoAspectRatio('1:1')
    }

    const handleOpenChange = (newOpen: boolean) => {
        if (isFormDisabled) return
        if (newOpen && addDisabled) { setOpen(false); return }
        setOpen(newOpen)
        if (!newOpen) resetForm()
    }

    // CREATE — creates firm + saves all non-branding fields, unlocks branding card
    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        setCreating(true)
        setError(null)
        const domain = allowDomainAccess ? (allowedEmailDomain?.trim() || null) : null
        try {
            const newFirm = await createFirm({
                name,
                allowDomainAccess: allowDomainAccess && !!domain,
                allowedEmailDomain: domain,
            })
            await updateFirm(newFirm.slug, {
                internalMemo: internalMemo.trim() || null,
                industry: industry.trim() || null,
                companySizeBracket: companySizeBracket || null,
                companyWebsite: companyWebsite.trim() || null,
                linkedInUrl: linkedInUrl.trim() || null,
                billingAddress: billingAddress.trim() || null,
                notes: notes.trim() || null,
                branding: {
                    subtext: subtext || null,
                    primaryColor: themeColor || null,
                    secondaryColor: secondaryColor || null,
                    website: null,
                    logoUrl: null,
                },
                currency: currencyCode
                    ? { symbol: WORLD_CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? null, code: currencyCode }
                    : { symbol: null, code: null },
            })
            setFirmId(newFirm.id)
            setFirmSlug(newFirm.slug)
            setPhase('branding')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create firm')
        } finally {
            setCreating(false)
        }
    }

    const exportLogoToBlob = (): Promise<Blob | null> => {
        if (!logoPreviewUrl || !isRasterLogo) return Promise.resolve(null)
        return new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = exportW; canvas.height = exportH
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }
                const scaleToFit = Math.min(exportW / img.naturalWidth, exportH / img.naturalHeight)
                const w = img.naturalWidth * scaleToFit
                const h = img.naturalHeight * scaleToFit
                ctx.save()
                ctx.translate(logoX * (exportW / previewW), logoY * (exportH / PREVIEW_H))
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

    // SAVE — saves branding + navigates to firm
    const handleSave = async () => {
        if (!firmSlug) return
        setSaving(true)
        setError(null)
        try {
            let resolvedLogoUrl = logoUrl
            if (logoFile && firmId) {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) throw new Error('Not authenticated')
                const formData = new FormData()
                const fileToUpload = isRasterLogo && hasLogoAdjustment
                    ? await exportLogoToBlob().then(blob => blob ? new File([blob], 'logo.png', { type: 'image/png' }) : logoFile)
                    : logoFile
                if (!fileToUpload) throw new Error('No file to upload')
                formData.set('file', fileToUpload)
                const res = await fetch(`/api/firms/${firmId}/logo`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    body: formData,
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error((err as { error?: string }).error ?? 'Logo upload failed')
                }
                const { logoUrl: uploadedUrl } = await res.json()
                resolvedLogoUrl = uploadedUrl ?? resolvedLogoUrl
            }
            await updateFirm(firmSlug, {
                branding: {
                    logoUrl: resolvedLogoUrl || null,
                    logoAspectRatio,
                    subtext: subtext || null,
                    primaryColor: themeColor || null,
                    secondaryColor: secondaryColor || null,
                    website: null,
                },
            })
            setOpen(false)
            resetForm()
            router.push(`/d/f/${firmSlug}`)
            router.refresh()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save branding')
        } finally {
            setSaving(false)
        }
    }

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!ALLOWED_LOGO_TYPES.includes(file.type?.toLowerCase())) return
        if (file.size > MAX_LOGO_SIZE) return
        setLogoFile(file); setLogoScale(1); setLogoX(0); setLogoY(0)
    }

    const onPointerDown = (e: React.PointerEvent) => {
        if (!(logoPreviewUrl || logoUrl)) return
        e.preventDefault()
        dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, startLogoX: logoX, startLogoY: logoY }
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current.isDragging) return
        setLogoX(dragRef.current.startLogoX + (e.clientX - dragRef.current.startX))
        setLogoY(dragRef.current.startLogoY + (e.clientY - dragRef.current.startY))
    }
    const onPointerUp = (e: React.PointerEvent) => {
        if (dragRef.current.isDragging) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        dragRef.current.isDragging = false
    }

    const renderTrigger = () => {
        if (trigger && React.isValidElement(trigger))
            return React.cloneElement(trigger as React.ReactElement<{ disabled?: boolean }>, { disabled: addDisabled })
        return (
            <Button variant="blackCta" size="sm" className="gap-2" disabled={addDisabled}>
                <SquarePlus className="h-4 w-4" /> New Firm
            </Button>
        )
    }

    const brandingLocked = phase === 'create'

    return (
        <div className="inline-flex flex-col items-end gap-1">
            <Dialog open={open} onOpenChange={handleOpenChange}>
                {!isControlled && <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>}

                <DialogContent className="sm:max-w-[960px] border-[#e5e7eb] p-0 gap-0 rounded-[2px] bg-[#f9f9fb] max-h-[90vh] overflow-y-auto">
                    <VisuallyHidden><DialogTitle>New Firm</DialogTitle></VisuallyHidden>

                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3 sticky top-0 z-10">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Firm</p>
                            <p className="text-xs text-[#45474c] mt-0.5">
                                {phase === 'create'
                                    ? 'Fill in the details and click Create. Branding (logo & colors) will unlock once the firm is created.'
                                    : `Firm "${name}" created. Now set up your branding.`}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mx-4 mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                            {error}
                        </div>
                    )}

                    <form onSubmit={phase === 'create' ? handleCreate : (e) => { e.preventDefault(); void handleSave() }}>
                        <div className="p-4">
                            <div className="grid grid-cols-3 gap-3">

                                {/* COL 1: Identity + Domain + Regional */}
                                <div className="flex flex-col gap-3 h-full">

                                    {/* IDENTITY */}
                                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                        <p className={fieldLabel}>Identity</p>
                                        <div>
                                            <label htmlFor="cf-name" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Firm name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                                            </label>
                                            <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)}
                                                placeholder="e.g. Acme Consulting" disabled={isFormDisabled || phase === 'branding'} required autoFocus className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="cf-memo" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Internal memo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— internal only</span></span>
                                            </label>
                                            <textarea id="cf-memo" value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)}
                                                placeholder="Private notes, context about this firm…" rows={2}
                                                disabled={isFormDisabled || phase === 'branding'} className={textareaCls} />
                                        </div>
                                    </div>

                                    {/* DOMAIN ACCESS */}
                                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                        <p className={fieldLabel}><span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Domain access</span></p>
                                        <div className="flex items-center justify-between gap-4">
                                            <Label htmlFor="cf-allow-domain" className="text-xs text-[#1b1b1d] cursor-pointer">
                                                Enable access for <span className="font-semibold">{allowedEmailDomain || 'your domain'}</span>
                                                <span className="block text-[#9a9ba0] font-normal mt-0.5">Users with this email domain can join without an invitation.</span>
                                            </Label>
                                            <Switch id="cf-allow-domain" checked={allowDomainAccess} onCheckedChange={setAllowDomainAccess}
                                                disabled={isFormDisabled || phase === 'branding'} />
                                        </div>
                                        {allowDomainAccess && (
                                            <div>
                                                <label htmlFor="cf-domain" className={fieldLabel}>
                                                    <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Email domain</span>
                                                </label>
                                                <Input id="cf-domain" value={allowedEmailDomain} onChange={(e) => setAllowedEmailDomain(e.target.value)}
                                                    placeholder="e.g. acme.com" disabled={isFormDisabled || phase === 'branding'} className={`font-mono ${inputCls}`} />
                                                {isPublicDomain && <p className="mt-1 text-[10px] text-amber-600">Public email domains are not recommended for firm access.</p>}
                                            </div>
                                        )}
                                    </div>

                                    {/* REGIONAL */}
                                    <div className="flex-1 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                        <p className={fieldLabel}>Regional</p>
                                        <div>
                                            <label className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> Currency <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                            </label>
                                            <SelectWithCustomEntry value={currencyCode} onChange={setCurrencyCode}
                                                options={WORLD_CURRENCIES.map(c => c.code)} placeholder="Select…"
                                                customEntryHint="Other symbol…" disabled={isFormDisabled || phase === 'branding'} />
                                            <p className="mt-1 text-[10px] text-[#9a9ba0]">Prefix on contract values.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* COL 2: Company */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-4 flex flex-col gap-3 h-full">
                                    <p className={fieldLabel}>Company</p>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-industry" className={fieldLabel}><span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span></label>
                                        <Input id="cf-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}
                                            placeholder="e.g. Technology" disabled={isFormDisabled || phase === 'branding'} className={inputCls} />
                                    </div>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-size" className={fieldLabel}><span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span></label>
                                        <SelectWithCustomEntry id="cf-size" value={companySizeBracket} onChange={setCompanySizeBracket}
                                            options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…"
                                            customEntryHint="Custom…" disabled={isFormDisabled || phase === 'branding'} />
                                    </div>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-website" className={fieldLabel}><span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span></label>
                                        <Input id="cf-website" type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)}
                                            placeholder="https://…" disabled={isFormDisabled || phase === 'branding'} className={inputCls} />
                                    </div>
                                    <div className="shrink-0">
                                        <label htmlFor="cf-linkedin" className={fieldLabel}><span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span></label>
                                        <Input id="cf-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)}
                                            placeholder="https://linkedin.com/company/…" disabled={isFormDisabled || phase === 'branding'} className={inputCls} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="cf-billing" className={fieldLabel}><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span></label>
                                        <textarea id="cf-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                                            placeholder={"123 Main St\nCity, State ZIP\nCountry"}
                                            disabled={isFormDisabled || phase === 'branding'} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="cf-notes" className={fieldLabel}><span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span></label>
                                        <textarea id="cf-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Additional details about the firm"
                                            disabled={isFormDisabled || phase === 'branding'} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                </div>

                                {/* COL 3: Branding */}
                                <div className={`relative bg-white rounded border border-[#e5e7eb] p-4 space-y-3 h-full transition-opacity ${brandingLocked ? 'opacity-50' : ''}`}>

                                    {/* Lock overlay while in create phase */}
                                    {brandingLocked && (
                                        <div className="absolute inset-0 z-10 rounded cursor-not-allowed" title="Create the firm first to unlock branding" />
                                    )}

                                    <div className="flex items-center justify-between">
                                        <p className={fieldLabel}>Branding</p>
                                        {brandingLocked && (
                                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#9a9ba0]">Unlocks after Create</span>
                                        )}
                                        {phase === 'branding' && (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-widest text-primary">
                                                <Check className="h-3 w-3" /> Firm created
                                            </span>
                                        )}
                                    </div>

                                    {/* Tagline */}
                                    <div>
                                        <label htmlFor="cf-tagline" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Type className="h-3 w-3" /> Brand tagline <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                        </label>
                                        <Input id="cf-tagline" value={subtext} onChange={(e) => setSubtext(e.target.value)}
                                            placeholder="Optional tagline or subtext" disabled={isFormDisabled || brandingLocked} className={inputCls} />
                                    </div>

                                    {/* Logo */}
                                    <div>
                                        <label className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Logo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                        </label>

                                        {/* Aspect ratio picker */}
                                        <div className="flex items-center gap-1.5 mb-2">
                                            {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                                const dims: Record<string, [number, number]> = { '1:1': [16, 16], '4:3': [21, 16], '16:9': [28, 16] }
                                                const [w, h] = dims[ar]
                                                const active = logoAspectRatio === ar
                                                return (
                                                    <button key={ar} type="button"
                                                        onClick={() => { setLogoAspectRatio(ar); setLogoScale(1); setLogoX(0); setLogoY(0) }}
                                                        disabled={brandingLocked || isFormDisabled}
                                                        className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'border-primary bg-primary/5 text-primary' : 'border-[#e5e7eb] text-[#9a9ba0] hover:border-[#45474c] hover:text-[#45474c]'}`}
                                                        aria-pressed={active}>
                                                        <span className={`block rounded-sm border-2 ${active ? 'border-primary' : 'border-current'}`} style={{ width: w, height: h }} />
                                                        <span className="text-[9px] font-mono font-bold tracking-wide leading-none">{ar}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        <p className="text-xs text-[#9a9ba0] mb-2">JPG, PNG or SVG. Max 5 MB.</p>
                                        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                                            onChange={handleLogoFileChange} className="sr-only" aria-hidden />

                                        <TooltipProvider delayDuration={300}>
                                            {!(logoPreviewUrl || logoUrl) ? (
                                                <button type="button" onClick={() => !brandingLocked && fileInputRef.current?.click()}
                                                    disabled={brandingLocked || isFormDisabled}
                                                    className="relative flex shrink-0 items-center justify-center rounded border-2 border-dashed border-[#e5e7eb] bg-slate-50 hover:border-primary/40 transition-colors focus:outline-none group disabled:pointer-events-none"
                                                    style={{ width: previewW, height: PREVIEW_H }} aria-label="Upload logo">
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
                                                    <div className="relative flex shrink-0 rounded border border-[#e5e7eb] overflow-hidden select-none group cursor-grab active:cursor-grabbing"
                                                        style={{ width: previewW, height: PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                                        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                                                        onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
                                                        <div className="absolute inset-0 flex items-center justify-center"
                                                            style={{ transform: `translate(${logoX}px,${logoY}px) scale(${logoScale})` }}>
                                                            <img src={logoPreviewUrl || logoUrl || undefined} alt="Logo preview"
                                                                className="max-w-full max-h-full object-contain pointer-events-none"
                                                                style={{ width: previewW, height: PREVIEW_H }} draggable={false} />
                                                        </div>
                                                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button type="button" onClick={() => fileInputRef.current?.click()}
                                                                        className="p-2 rounded bg-white text-[#1b1b1d] hover:bg-[#f9f9fb] shadow-sm"><ImagePlus className="h-4 w-4" /></button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Replace</TooltipContent>
                                                            </Tooltip>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button type="button" onClick={() => { setLogoFile(null); setLogoPreviewUrl(null); setLogoUrl('') }}
                                                                        className="p-2 rounded bg-white text-red-600 hover:bg-red-50 shadow-sm"><Trash2 className="h-4 w-4" /></button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Remove</TooltipContent>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1" style={{ maxWidth: previewW, width: '100%' }}>
                                                        <input type="range" min={-1} max={1} step={0.04}
                                                            value={logoScale <= 1 ? (logoScale - 1) / 0.5 : (logoScale - 1) / 2}
                                                            onChange={(e) => { const v = Number(e.target.value); setLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2) }}
                                                            className="w-full h-1.5 rounded appearance-none bg-[#e5e7eb] accent-primary" />
                                                        <div className="flex items-center justify-between px-0.5">
                                                            <button type="button" onClick={() => setLogoScale(Math.max(0.5, logoScale - 0.1))} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none">−</button>
                                                            <button type="button" onClick={() => { setLogoScale(1); setLogoX(0); setLogoY(0) }}
                                                                disabled={logoScale === 1 && logoX === 0 && logoY === 0}
                                                                className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3 w-3" /></button>
                                                            <button type="button" onClick={() => setLogoScale(Math.min(3, logoScale + 0.1))} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none">+</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </TooltipProvider>
                                    </div>

                                    {/* Primary color */}
                                    <div>
                                        <label htmlFor="cf-color" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand primary color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input id="cf-color" type="color" value={themeColor || FIRMA_COLOR}
                                                onChange={(e) => setThemeColor(e.target.value)} disabled={isFormDisabled || brandingLocked}
                                                className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                            <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)}
                                                placeholder="Leave empty for Firma default" disabled={isFormDisabled || brandingLocked} className={`font-mono ${inputCls}`} />
                                            <button type="button" onClick={() => setThemeColor('')} disabled={!themeColor || brandingLocked}
                                                className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3.5 w-3.5" /></button>
                                        </div>
                                        {themeColor && /^#[0-9A-Fa-f]{6}$/.test(themeColor) && contrastRatioAgainstWhite(themeColor) < 3 && (
                                            <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                                <Info className="h-3 w-3 shrink-0" /> Low contrast against white ({contrastRatioAgainstWhite(themeColor)}:1).
                                            </p>
                                        )}
                                    </div>

                                    {/* Accent color */}
                                    <div>
                                        <label htmlFor="cf-accent" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand accent color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                        </label>
                                        <p className="text-[11px] text-[#9a9ba0] mb-1">Used for nav stripe &amp; tab underlines. Leave empty to match primary.</p>
                                        <div className="flex items-center gap-2">
                                            <div className="relative h-9 w-10 shrink-0">
                                                <input id="cf-accent" type="color" value={secondaryColor || '#ffffff'}
                                                    onChange={(e) => setSecondaryColor(e.target.value)} disabled={isFormDisabled || brandingLocked}
                                                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                                <div className="h-9 w-10 rounded border border-[#e5e7eb] pointer-events-none"
                                                    style={secondaryColor ? { backgroundColor: secondaryColor } : { background: 'repeating-linear-gradient(45deg,#e5e7eb 0px,#e5e7eb 2px,white 2px,white 6px)' }} />
                                            </div>
                                            <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                                                placeholder="Leave empty to match primary" disabled={isFormDisabled || brandingLocked} className={`font-mono ${inputCls}`} />
                                            <button type="button" onClick={() => setSecondaryColor('')} disabled={!secondaryColor || brandingLocked}
                                                className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>

                                    {/* Header preview */}
                                    {phase === 'branding' && (
                                        <div>
                                            <p className={`${fieldLabel} mb-2`}>Header preview</p>
                                            <div className="rounded border border-[#e5e7eb] bg-white px-3 py-2 flex items-center gap-2.5">
                                                {(logoPreviewUrl || logoUrl) ? (() => {
                                                    const dH = 40; const dW = Math.round(dH * aspectMap[logoAspectRatio]); const sc = dH / PREVIEW_H
                                                    return (
                                                        <div className="relative shrink-0 rounded-lg bg-slate-50 border-2 border-slate-100 overflow-hidden" style={{ width: dW, height: dH }}>
                                                            <div className="absolute inset-0 flex items-center justify-center"
                                                                style={{ transform: `translate(${logoX * sc}px,${logoY * sc}px) scale(${logoScale})`, transformOrigin: 'center' }}>
                                                                <img src={logoPreviewUrl || logoUrl || undefined} alt="" className="object-contain pointer-events-none" style={{ width: dW, height: dH }} draggable={false} />
                                                            </div>
                                                        </div>
                                                    )
                                                })() : (
                                                    <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-50 border-2 border-slate-100 h-10 w-10 text-lg font-semibold"
                                                        style={{ color: themeColor || FIRMA_COLOR }}>
                                                        {(name || '?').trim().charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-headline text-xl font-bold tracking-tighter text-[#1b1b1d] truncate leading-tight">{name}</p>
                                                    {subtext && <p className="text-[11px] text-gray-500 truncate">{subtext}</p>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3 sticky bottom-0">
                            {phase === 'branding' && (
                                <span className="mr-auto text-[11px] text-[#9a9ba0] flex items-center gap-1.5">
                                    <Check className="h-3.5 w-3.5 text-primary" /> Firm created — set up branding or skip
                                </span>
                            )}
                            <Button type="button" variant="outline"
                                className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase"
                                onClick={() => {
                                    if (phase === 'branding' && firmSlug) {
                                        setOpen(false); resetForm()
                                        router.push(`/d/f/${firmSlug}`); router.refresh()
                                    } else {
                                        handleOpenChange(false)
                                    }
                                }}
                                disabled={isFormDisabled}>
                                {phase === 'branding' ? 'Skip' : 'Cancel'}
                            </Button>
                            <Button type="submit"
                                variant="greenCta"
                                disabled={isFormDisabled || !name.trim()}
                                className="rounded-[2px] w-40 text-[10px] font-headline font-bold tracking-widest uppercase">
                                {creating || saving ? <LoadingSpinner size="sm" /> : phase === 'create' ? 'Create' : 'Save Branding'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {!isControlled && showUpgradeHint && (
                <p className="text-xs text-slate-600 text-right max-w-[240px] leading-snug ml-auto">
                    {upgradeCopy.addFirmModalHint}{' '}
                    <Link href={billingHref} className="font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-800">
                        {upgradeCopy.ctaContinueBilling}
                    </Link>
                </p>
            )}
        </div>
    )
}
