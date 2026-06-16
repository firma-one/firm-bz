'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { AlertTriangle, Bell, Building2, ChevronDown, Check, DollarSign, FileText, FlaskConical, Globe, HardDrive, ImageIcon, ImagePlus, Info, Linkedin, Lock, MapPin, Palette, RefreshCw, RotateCcw, Shield, Trash2, Type, User, Users2, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { FirmDriveSection } from '@/components/connectors/firm-drive-section'
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

export interface FirmSettingsFormProps {
    orgSlug: string
    orgId?: string | null
    initialName: string
    firmSandboxOnly?: boolean
    initialSection?: Section
    onSaved?: () => void
}

type Section = 'main' | 'branding' | 'appsettings' | 'storage' | 'danger'

export function FirmSettingsForm({
    orgSlug,
    orgId: orgIdProp,
    initialName,
    firmSandboxOnly = false,
    initialSection,
    onSaved,
}: FirmSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [orgIdState, setOrgIdState] = useState<string | null>(null)
    const orgId = orgIdProp ?? orgIdState
    const [openSection, setOpenSection] = useState<Section>(initialSection ?? 'main')
    const [storageConnectorCount, setStorageConnectorCount] = useState<number | null>(null)
    const [name, setName] = useState(initialName)
    const [internalMemo, setInternalMemo] = useState('')
    const [industry, setIndustry] = useState('')
    const [companySizeBracket, setCompanySizeBracket] = useState('')
    const [companyWebsite, setCompanyWebsite] = useState('')
    const [linkedInUrl, setLinkedInUrl] = useState('')
    const [billingAddress, setBillingAddress] = useState('')
    const [notes, setNotes] = useState('')
    const [website, setWebsite] = useState('')
    const [currencyOpen, setCurrencyOpen] = useState(false)
    const [currencyCode, setCurrencyCode] = useState('')
    const [currencyIsCustom, setCurrencyIsCustom] = useState(false)
    const [currencyCustom, setCurrencyCustom] = useState('')
    const [enableBetaFeatures, setEnableBetaFeatures] = useState(false)
    const [immediateOnCreate, setImmediateOnCreate] = useState(true)
    const [recurringEnabled, setRecurringEnabled] = useState(true)
    const [recurringFrequencyDays, setRecurringFrequencyDays] = useState(1)
    const [startDaysBeforeDue, setStartDaysBeforeDue] = useState(7)
    const [allowDomainAccess, setAllowDomainAccess] = useState(false)
    const [allowedEmailDomain, setAllowedEmailDomain] = useState('')
    const [saving, setSaving] = useState(false)
    const [mainDirty, setMainDirty] = useState(false)
    const [appDirty, setAppDirty] = useState(false)
    const [savingBrand, setSavingBrand] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [loaded, setLoaded] = useState(false)

    const toggleSection = (s: Section) => setOpenSection((prev) => (prev === s ? 'main' : s))

    // Branding state
    const [brandName, setBrandName] = useState('')
    const [brandSubtext, setBrandSubtext] = useState('')
    const [brandPrimaryColor, setBrandPrimaryColor] = useState('')
    const [brandSecondaryColor, setBrandSecondaryColor] = useState('')
    const [brandLogoUrl, setBrandLogoUrl] = useState('')
    const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null)
    const [brandLogoPreviewUrl, setBrandLogoPreviewUrl] = useState<string | null>(null)
    const [brandLogoScale, setBrandLogoScale] = useState(1)
    const [brandLogoX, setBrandLogoX] = useState(0)
    const [brandLogoY, setBrandLogoY] = useState(0)
    const [brandLogoAspectRatio, setBrandLogoAspectRatio] = useState<'1:1' | '4:3' | '16:9'>('1:1')
    const [brandDirty, setBrandDirty] = useState(false)
    const brandFileInputRef = useRef<HTMLInputElement>(null)
    const brandDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })
    const BRAND_PREVIEW_H = 160
    const brandAspectMap = { '1:1': 1, '4:3': 4/3, '16:9': 16/9 } as const
    const brandPreviewW = Math.round(BRAND_PREVIEW_H * brandAspectMap[brandLogoAspectRatio])
    const FIRMA_COLOR = '#006668'
    const isRasterBrandLogo = brandLogoFile?.type === 'image/png' || brandLogoFile?.type === 'image/jpeg' || brandLogoFile?.type === 'image/jpg'

    useEffect(() => { setName(initialName) }, [initialName])

    useEffect(() => {
        if (storageConnectorCount === 0 && openSection !== 'storage') {
            setOpenSection('storage')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageConnectorCount])

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
                const c = (settings.currency as Record<string, string | undefined>) ?? {}
                if (!cancelled) {
                    const b = (settings.branding as any) ?? {}
                    setBrandName(b.name ?? '')
                    setBrandSubtext(b.subtext ?? '')
                    setBrandPrimaryColor(b.primaryColor ?? '')
                    setBrandSecondaryColor(b.secondaryColor ?? '')
                    setBrandLogoUrl(b.logoData ?? b.logoUrl ?? '')
                    const ar = b.logoAspectRatio
                    setBrandLogoAspectRatio(ar === '4:3' || ar === '16:9' ? ar : '1:1')
                    setBrandDirty(false)
                    setWebsite(b?.website ?? '')
                    setInternalMemo((settings.internalMemo as string) ?? '')
                    setIndustry((settings.industry as string) ?? '')
                    setCompanySizeBracket((settings.companySizeBracket as string) ?? '')
                    setCompanyWebsite((settings.companyWebsite as string) ?? '')
                    setLinkedInUrl((settings.linkedInUrl as string) ?? '')
                    setBillingAddress((settings.billingAddress as string) ?? '')
                    setNotes((settings.notes as string) ?? '')
                    setEnableBetaFeatures(settings.enableBetaFeatures === true)
                    const rc = (settings.reminderEmailConfig as Record<string, any>) ?? {}
                    setImmediateOnCreate(rc.immediateOnCreate ?? true)
                    setRecurringEnabled(rc.recurring?.enabled ?? true)
                    setRecurringFrequencyDays(rc.recurring?.frequencyDays ?? 1)
                    setStartDaysBeforeDue(rc.recurring?.startDaysBeforeDue ?? 7)
                    const savedDomainAccess = firm.allowDomainAccess === true
                    const savedDomain = firm.allowedEmailDomain ?? ''
                    if (!savedDomainAccess && !savedDomain) {
                        const creatorEmail = (data.creatorEmail as string | null) ?? ''
                        const userDomain = creatorEmail.split('@')[1] ?? ''
                        if (userDomain && !PUBLIC_EMAIL_DOMAINS.has(userDomain.toLowerCase())) {
                            setAllowDomainAccess(true)
                            setAllowedEmailDomain(userDomain)
                        } else {
                            setAllowDomainAccess(false)
                            setAllowedEmailDomain('')
                        }
                    } else {
                        setAllowDomainAccess(savedDomainAccess)
                        setAllowedEmailDomain(savedDomain)
                    }
                    setMainDirty(false)
                    setAppDirty(false)
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
                if (!cancelled) setLoaded(true)
            }
        }
        loadBranding()
        return () => { cancelled = true }
    }, [orgSlug])

    const isPublicDomain = allowedEmailDomain && PUBLIC_EMAIL_DOMAINS.has(allowedEmailDomain.toLowerCase())

    // Logo preview URL from file
    useEffect(() => {
        if (!brandLogoFile) return
        const url = URL.createObjectURL(brandLogoFile)
        setBrandLogoPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [brandLogoFile])

    const handleBrandLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) { setBrandLogoFile(null); return }
        const type = file.type?.toLowerCase()
        if (!['image/jpeg','image/png','image/svg+xml','image/jpg'].includes(type)) { addToast({ type: 'error', title: 'Invalid file', message: 'Use JPG, PNG, or SVG.' }); return }
        if (file.size > 5 * 1024 * 1024) { addToast({ type: 'error', title: 'File too large', message: 'Logo must be under 5 MB.' }); return }
        setBrandLogoFile(file); setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0); setBrandDirty(true)
    }

    const onBrandPointerDown = (e: React.PointerEvent) => {
        if (!(brandLogoPreviewUrl || brandLogoUrl)) return
        e.preventDefault()
        brandDragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, startLogoX: brandLogoX, startLogoY: brandLogoY }
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onBrandPointerMove = (e: React.PointerEvent) => {
        if (!brandDragRef.current.isDragging) return
        setBrandLogoX(brandDragRef.current.startLogoX + (e.clientX - brandDragRef.current.startX))
        setBrandLogoY(brandDragRef.current.startLogoY + (e.clientY - brandDragRef.current.startY))
    }
    const onBrandPointerUp = (e: React.PointerEvent) => {
        if (brandDragRef.current.isDragging) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        brandDragRef.current.isDragging = false
    }

    const exportBrandLogoToBlob = (): Promise<Blob | null> => {
        if (!brandLogoPreviewUrl || !isRasterBrandLogo) return Promise.resolve(null)
        const exportH = 400; const exportW = Math.round(exportH * brandAspectMap[brandLogoAspectRatio])
        return new Promise((resolve) => {
            const img = new Image(); img.crossOrigin = 'anonymous'
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = exportW; canvas.height = exportH
                const ctx = canvas.getContext('2d'); if (!ctx) { resolve(null); return }
                ctx.save(); ctx.translate(exportW / 2 + brandLogoX * (exportH / BRAND_PREVIEW_H), exportH / 2 + brandLogoY * (exportH / BRAND_PREVIEW_H)); ctx.scale(brandLogoScale, brandLogoScale)
                ctx.drawImage(img, -exportW / 2, -exportH / 2, exportW, exportH); ctx.restore()
                canvas.toBlob((b) => resolve(b), 'image/png', 0.92)
            }
            img.onerror = () => resolve(null); img.src = brandLogoPreviewUrl
        })
    }

    const handleSaveBrand = async () => {
        if (isSandboxFirm) return
        setSavingBrand(true)
        try {
            let logoData: string | null = null
            if (brandLogoFile) {
                if (isRasterBrandLogo) {
                    const blob = await exportBrandLogoToBlob()
                    if (blob) logoData = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
                }
                if (!logoData) logoData = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(brandLogoFile) })
            } else if (brandLogoUrl?.startsWith('data:')) {
                logoData = brandLogoUrl
            }
            await updateFirm(orgSlug, {
                branding: {
                    name: brandName || null,
                    subtext: brandSubtext || null,
                    logoData,
                    logoAspectRatio: brandLogoAspectRatio,
                    primaryColor: brandPrimaryColor || null,
                    secondaryColor: brandSecondaryColor || null,
                    website: website || null,
                },
            })
            if (logoData) setBrandLogoUrl(logoData)
            setBrandLogoFile(null); setBrandLogoPreviewUrl(null); setBrandDirty(false)
            addToast({ type: 'success', title: 'Branding saved', message: 'Firm branding updated.' })
            window.dispatchEvent(new CustomEvent('firm-branding-updated'))
        } catch (e) {
            addToast({ type: 'error', title: 'Save failed', message: e instanceof Error ? e.message : 'Could not save branding.' })
        } finally {
            setSavingBrand(false)
        }
    }

    const handleSave = async ({ skipNavigation = false }: { skipNavigation?: boolean } = {}) => {
        if (isSandboxFirm) return
        if (!name.trim()) {
            addToast({ type: 'error', title: 'Required', message: 'Firm name is required.' })
            return
        }
        setSaving(true)
        try {
            await updateFirm(orgSlug, {
                name,
                branding: {
                    website: website.trim() || null,
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
                reminderEmailConfig: {
                    immediateOnCreate,
                    recurring: {
                        enabled: recurringEnabled,
                        frequencyDays: recurringFrequencyDays,
                        startDaysBeforeDue,
                    },
                },
            })
            setMainDirty(false); setAppDirty(false)
            addToast({ type: 'success', title: 'Saved', message: 'Firm details updated.' })
            if (typeof window !== 'undefined') {
                await new Promise<void>((resolve) => {
                    const handler = () => { window.removeEventListener('firm-branding-reloaded', handler); resolve() }
                    window.addEventListener('firm-branding-reloaded', handler)
                    window.dispatchEvent(new CustomEvent('firm-branding-updated'))
                    setTimeout(resolve, 1500)
                })
            }
            if (!skipNavigation) onSaved?.()
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

    const accentColor = brandPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryColor) ? brandPrimaryColor : null
    const sectionHeaderStyle = accentColor
        ? { backgroundColor: `${accentColor}0f` } // ~6% opacity tint
        : undefined

    const mainSave = (
        <div className="flex items-center gap-3 pt-2">
            <Button type="button" variant="greenCta" onClick={() => void handleSave()}
                disabled={isSandboxFirm || saving || !loaded || !mainDirty}
                className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                {saving ? 'Saving…' : 'Save'}
            </Button>
        </div>
    )

    const appSave = (
        <div className="flex items-center gap-3 pt-2">
            <Button type="button" variant="greenCta" onClick={() => void handleSave({ skipNavigation: true })}
                disabled={isSandboxFirm || saving || !loaded || !appDirty}
                className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                {saving ? 'Saving…' : 'Save'}
            </Button>
        </div>
    )

    return (
        <div className="flex flex-col gap-4">
            {isSandboxFirm && <SandboxInfoBanner />}

            {/* ── 1. MAIN (Details + Company + Reminders) ── */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('main')}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#fafafa' }}>
                    <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-[#45474c]" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#45474c]">Main</span>
                        {mainDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'main' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'main' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                        <div className="p-5 border-t border-[#e5e7eb] bg-white">
                            <div className="grid grid-cols-2 gap-5 items-stretch">

                                {/* LEFT — Details + Industry + Company Size */}
                                <div className="flex flex-col">
                                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3 flex-1">
                                        <p className={fieldLabel}>Details</p>
                                        <div>
                                            <label htmlFor="org-name" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Firm name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                                            </label>
                                            <Input id="org-name" value={name} onChange={(e) => { setName(e.target.value); setMainDirty(true) }} placeholder="Firm name" disabled={isSandboxFirm} className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="org-internal-memo" className={fieldLabel}>
                                                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Internal memo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— internal only</span></span>
                                            </label>
                                            <textarea id="org-internal-memo" value={internalMemo} onChange={(e) => { setInternalMemo(e.target.value); setMainDirty(true) }} placeholder="Private notes, context about this firm…" rows={2} disabled={isSandboxFirm} className={textareaCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="firm-industry" className={fieldLabel}><span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span></label>
                                            <Input id="firm-industry" value={industry} onChange={(e) => { setIndustry(e.target.value); setMainDirty(true) }} placeholder="e.g. Technology" disabled={isSandboxFirm} className={inputCls} />
                                        </div>
                                        <div>
                                            <label htmlFor="firm-company-size" className={fieldLabel}><span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span></label>
                                            <SelectWithCustomEntry id="firm-company-size" value={companySizeBracket} onChange={(v) => { setCompanySizeBracket(v); setMainDirty(true) }} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…" customEntryHint="Custom…" disabled={isSandboxFirm} />
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT — Company (Website, LinkedIn, Address, Notes) */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-4 flex flex-col gap-3 h-full">
                                    <p className={`${fieldLabel} shrink-0`}>Company</p>
                                    <div className="shrink-0">
                                        <label htmlFor="firm-company-website" className={fieldLabel}><span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span></label>
                                        <Input id="firm-company-website" type="url" value={companyWebsite} onChange={(e) => { setCompanyWebsite(e.target.value); setMainDirty(true) }} placeholder="https://…" disabled={isSandboxFirm} className={inputCls} />
                                    </div>
                                    <div className="shrink-0">
                                        <label htmlFor="firm-linkedin" className={fieldLabel}><span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span></label>
                                        <Input id="firm-linkedin" value={linkedInUrl} onChange={(e) => { setLinkedInUrl(e.target.value); setMainDirty(true) }} placeholder="https://linkedin.com/company/…" disabled={isSandboxFirm} className={inputCls} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="firm-billing-address" className={fieldLabel}><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span></label>
                                        <textarea id="firm-billing-address" value={billingAddress} onChange={(e) => { setBillingAddress(e.target.value); setMainDirty(true) }} placeholder={"123 Main St\nCity, State ZIP\nCountry"} disabled={isSandboxFirm} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <label htmlFor="firm-notes" className={fieldLabel}><span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span></label>
                                        <textarea id="firm-notes" value={notes} onChange={(e) => { setNotes(e.target.value); setMainDirty(true) }} placeholder="Additional details about the firm" disabled={isSandboxFirm} className={`${textareaCls} flex-1 resize-none`} />
                                    </div>
                                </div>
                            </div>

                            {mainSave}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. BRANDING ── */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('branding')}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#fafafa' }}>
                    <div className="flex items-center gap-2">
                        <Palette className="h-3.5 w-3.5 text-[#45474c]" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#45474c]">Branding</span>
                        {brandDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'branding' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'branding' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                        <div className="p-5 border-t border-[#e5e7eb] bg-white">
                            <div className="grid grid-cols-[1fr_1fr] gap-4">
                                {/* Left: identity + colors */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className={fieldLabel}>Identity</p>
                                        {(brandPrimaryColor || brandSecondaryColor) && !isSandboxFirm && (
                                            <button type="button" onClick={() => { setBrandPrimaryColor(''); setBrandSecondaryColor(''); setBrandDirty(true) }}
                                                className="inline-flex items-center gap-1 text-[10px] font-medium text-firma hover:text-firma/80 transition-colors">
                                                <RotateCcw className="h-3 w-3" /> Reset colors
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="firm-brand-name" className={fieldLabel}><span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Display name <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— shown in topbar</span></span></label>
                                        <input id="firm-brand-name" value={brandName} onChange={(e) => { setBrandName(e.target.value); setBrandDirty(true) }} placeholder={name || 'Firm name'} disabled={isSandboxFirm} className={`flex h-9 w-full rounded border bg-white px-3 py-2 ${inputCls}`} />
                                    </div>
                                    <div>
                                        <label htmlFor="firm-brand-subtext" className={fieldLabel}><span className="inline-flex items-center gap-1"><Type className="h-3 w-3" /> Brand tagline <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span></label>
                                        <input id="firm-brand-subtext" value={brandSubtext} onChange={(e) => { setBrandSubtext(e.target.value); setBrandDirty(true) }} placeholder="Optional tagline or subtext" disabled={isSandboxFirm} className={`flex h-9 w-full rounded border bg-white px-3 py-2 ${inputCls}`} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="firm-brand-primary" className={fieldLabel}><span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Primary color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span></label>
                                        <div className="flex items-center gap-2">
                                            <input id="firm-brand-primary" type="color" value={brandPrimaryColor || FIRMA_COLOR} onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true) }} disabled={isSandboxFirm} className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                            <input value={brandPrimaryColor} onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true) }} placeholder={`Default (${FIRMA_COLOR})`} disabled={isSandboxFirm} className={`flex h-9 w-full rounded border bg-white px-3 py-2 font-mono ${inputCls}`} />
                                            <button type="button" onClick={() => { setBrandPrimaryColor(''); setBrandDirty(true) }} disabled={!brandPrimaryColor || isSandboxFirm} className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="firm-brand-accent" className={fieldLabel}><span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Accent color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span></label>
                                        <p className="text-[11px] text-[#9a9ba0]">Used for nav stripe &amp; tab underlines. Leave empty to match primary.</p>
                                        <div className="flex items-center gap-2">
                                            <div className="relative h-9 w-10 shrink-0">
                                                <input id="firm-brand-accent" type="color" value={brandSecondaryColor || '#ffffff'} onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true) }} disabled={isSandboxFirm} className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                                <div className="h-9 w-10 rounded border border-[#e5e7eb] pointer-events-none" style={brandSecondaryColor ? { backgroundColor: brandSecondaryColor } : { background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, white 2px, white 6px)' }} />
                                            </div>
                                            <input value={brandSecondaryColor} onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true) }} placeholder="Match primary" disabled={isSandboxFirm} className={`flex h-9 w-full rounded border bg-white px-3 py-2 font-mono ${inputCls}`} />
                                            <button type="button" onClick={() => { setBrandSecondaryColor(''); setBrandDirty(true) }} disabled={!brandSecondaryColor || isSandboxFirm} className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>
                                </div>
                                {/* Right: logo */}
                                <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                    <p className={fieldLabel}>Logo &amp; preview</p>
                                    <div className="flex items-center gap-1.5">
                                        {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                            const dims: Record<string, [number,number]> = { '1:1': [16,16], '4:3': [21,16], '16:9': [28,16] }
                                            const [w, h] = dims[ar]; const active = brandLogoAspectRatio === ar
                                            return (
                                                <button key={ar} type="button" onClick={() => { setBrandLogoAspectRatio(ar); setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0); setBrandDirty(true) }} disabled={isSandboxFirm}
                                                    className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded border transition-colors disabled:opacity-50 ${active ? 'border-primary bg-primary/5 text-primary' : 'border-[#e5e7eb] text-[#9a9ba0] hover:border-[#45474c] hover:text-[#45474c]'}`}>
                                                    <span className={`block rounded-sm border-2 ${active ? 'border-primary' : 'border-current'}`} style={{ width: w, height: h }} />
                                                    <span className="text-[9px] font-mono font-bold tracking-wide leading-none">{ar}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="text-xs text-[#9a9ba0]">JPG, PNG or SVG. Max 5 MB.</p>
                                    <input ref={brandFileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml" onChange={handleBrandLogoFileChange} className="sr-only" aria-hidden />
                                    {!(brandLogoPreviewUrl || brandLogoUrl) ? (
                                        <button type="button" onClick={() => brandFileInputRef.current?.click()} disabled={isSandboxFirm}
                                            className="relative flex shrink-0 items-center justify-center rounded border-2 border-dashed border-[#e5e7eb] bg-slate-50 hover:border-primary/40 transition-colors focus:outline-none group disabled:opacity-60 disabled:cursor-not-allowed"
                                            style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }}>
                                            <span className="text-5xl font-semibold text-slate-300 group-hover:opacity-30 transition-opacity">{(brandName || name).trim().charAt(0).toUpperCase() || '?'}</span>
                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ImagePlus className="h-6 w-6 text-primary" /><span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Upload logo</span>
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <div className="relative flex shrink-0 rounded border border-[#e5e7eb] overflow-hidden select-none group cursor-grab active:cursor-grabbing"
                                                style={{ width: brandPreviewW, height: BRAND_PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                                onPointerDown={onBrandPointerDown} onPointerMove={onBrandPointerMove} onPointerUp={onBrandPointerUp} onPointerLeave={onBrandPointerUp}>
                                                <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${brandLogoX}px, ${brandLogoY}px) scale(${brandLogoScale})` }}>
                                                    <img src={brandLogoPreviewUrl || brandLogoUrl || undefined} alt="Logo" className="max-w-full max-h-full object-contain pointer-events-none" style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} draggable={false} />
                                                </div>
                                                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                                    <button type="button" onClick={() => brandFileInputRef.current?.click()} disabled={isSandboxFirm} className="p-2 rounded bg-white text-[#1b1b1d] hover:bg-[#f9f9fb] shadow-sm disabled:opacity-50"><ImagePlus className="h-4 w-4" /></button>
                                                    <button type="button" onClick={() => { setBrandLogoUrl(''); setBrandLogoFile(null); setBrandLogoPreviewUrl(null); setBrandDirty(true) }} disabled={isSandboxFirm} className="p-2 rounded bg-white text-red-600 hover:bg-red-50 shadow-sm disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                                                </div>
                                            </div>
                                            <input type="range" min={-1} max={1} step={0.04}
                                                value={brandLogoScale <= 1 ? (brandLogoScale - 1) / 0.5 : (brandLogoScale - 1) / 2}
                                                onChange={(e) => { const v = Number(e.target.value); setBrandLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2); setBrandDirty(true) }}
                                                disabled={isSandboxFirm} className="w-full h-1.5 rounded appearance-none bg-[#e5e7eb] accent-primary disabled:opacity-60" style={{ maxWidth: brandPreviewW }} />
                                        </div>
                                    )}
                                    <div className="mt-1">
                                        <p className={`${fieldLabel} mb-2`}>Header preview</p>
                                        <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3 flex items-center gap-3">
                                            {(brandLogoPreviewUrl || brandLogoUrl) ? (() => {
                                                const dH = 40; const dW = Math.round(dH * brandAspectMap[brandLogoAspectRatio]); const sc = dH / BRAND_PREVIEW_H
                                                return (
                                                    <div className="relative shrink-0 rounded-lg bg-slate-50 border-2 border-slate-100 overflow-hidden" style={{ width: dW, height: dH }}>
                                                        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${brandLogoX * sc}px, ${brandLogoY * sc}px) scale(${brandLogoScale})`, transformOrigin: 'center' }}>
                                                            <img src={brandLogoPreviewUrl || brandLogoUrl || ''} alt="Logo" className="object-contain pointer-events-none" style={{ width: dW, height: dH }} draggable={false} />
                                                        </div>
                                                    </div>
                                                )
                                            })() : (
                                                <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-50 border-2 border-slate-100 h-10 w-10 text-lg font-semibold" style={{ color: brandPrimaryColor || FIRMA_COLOR }}>
                                                    {(brandName || name || '?').trim().charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <div className="flex flex-col justify-center min-w-0">
                                                <span className="font-headline text-xl font-bold tracking-tighter text-[#1b1b1d] truncate leading-tight">{brandName || name || 'Firm name'}</span>
                                                {brandSubtext && <span className="text-[11px] text-gray-500 truncate mt-0.5">{brandSubtext}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                                <Button onClick={() => void handleSaveBrand()} disabled={isSandboxFirm || savingBrand || !brandDirty} variant="greenCta"
                                    className="rounded-[2px] w-40 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                                    {savingBrand ? 'Saving…' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 3. APP SETTINGS (Features) ── */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('appsettings')}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#fafafa' }}>
                    <div className="flex items-center gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-[#45474c]" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#45474c]">App Settings</span>
                        {appDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'appsettings' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'appsettings' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                        <div className="p-5 border-t border-[#e5e7eb] bg-white">
                            <div className="grid grid-cols-2 gap-4">

                            {/* Domain Access */}
                            <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                <p className={fieldLabel}><span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Domain access</span></p>
                                <div className="flex items-center justify-between gap-4">
                                    <Label htmlFor="allow-domain" className="text-xs text-[#1b1b1d] cursor-pointer">
                                        Enable access for <span className="font-semibold">{allowedEmailDomain || 'your domain'}</span>
                                        <span className="block text-[#9a9ba0] font-normal mt-0.5">Users with this email domain can join without an invitation.</span>
                                    </Label>
                                    <Switch id="allow-domain" checked={allowDomainAccess} onCheckedChange={(v) => { setAllowDomainAccess(v); setAppDirty(true) }} disabled={isSandboxFirm || !loaded} />
                                </div>
                                {allowDomainAccess && (
                                    <div>
                                        <label htmlFor="allowed-email-domain" className={fieldLabel}>
                                            <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Email domain</span>
                                        </label>
                                        <Input id="allowed-email-domain" value={allowedEmailDomain} onChange={(e) => { setAllowedEmailDomain(e.target.value); setAppDirty(true) }} placeholder="e.g. acme.com" disabled={isSandboxFirm} className={`font-mono ${inputCls}`} />
                                        {isPublicDomain && <p className="mt-1 text-[10px] text-amber-600">Public email domains (e.g. gmail.com) are not recommended for firm access.</p>}
                                    </div>
                                )}
                            </div>

                            {/* Regional */}
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
                                                        {currencyCode ? WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.label ?? currencyCode : currencyIsCustom && currencyCustom ? `Other: ${currencyCustom}` : 'Select…'}
                                                    </span>
                                                </button>
                                            </DropdownMenuTrigger>
                                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                                                {(currencyCode || (currencyIsCustom && currencyCustom)) && !isSandboxFirm ? (
                                                    <button type="button" className="pointer-events-auto p-0.5 rounded text-[#9a9ba0] hover:text-[#1b1b1d] hover:bg-gray-100 transition-colors" onClick={(e) => { e.stopPropagation(); setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setAppDirty(true) }} aria-label="Clear"><X className="h-3 w-3" /></button>
                                                ) : (
                                                    <ChevronDown className="h-3 w-3 text-[#45474c]" />
                                                )}
                                            </div>
                                            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1 max-h-72 overflow-y-auto rounded" onCloseAutoFocus={(e) => e.preventDefault()}>
                                                {(currencyCode || currencyIsCustom) && (<><DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-sm rounded text-[#45474c] hover:text-red-600" onSelect={() => { setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false); setAppDirty(true) }}><span className="text-[#9a9ba0]">×</span> Clear selection</DropdownMenuItem><DropdownMenuSeparator /></>)}
                                                {WORLD_CURRENCIES.map((cur) => (
                                                    <DropdownMenuItem key={cur.code} className="flex items-center justify-between cursor-pointer text-sm rounded" onSelect={() => { setCurrencyCode(cur.code); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false); setAppDirty(true) }}>
                                                        {cur.label}
                                                        {currencyCode === cur.code && !currencyIsCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                                    </DropdownMenuItem>
                                                ))}
                                                <DropdownMenuSeparator />
                                                <div className="px-2 py-1.5 flex items-center gap-2">
                                                    <input value={currencyIsCustom ? currencyCustom : ''} onChange={(e) => { setCurrencyCustom(e.target.value); setCurrencyIsCustom(true); setCurrencyCode(''); setAppDirty(true) }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setCurrencyOpen(false) }} onClick={(e) => e.stopPropagation()} placeholder="Other (enter symbol)…" className="flex-1 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] outline-none bg-transparent" />
                                                    {currencyIsCustom && currencyCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                                </div>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <p className="mt-1 text-xs text-[#9a9ba0]">Prefix on contract values.</p>
                                </div>
                            </div>

                            {/* Email Reminders */}
                            <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                <p className={`${fieldLabel} mb-1`}>Email Reminders</p>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-start gap-2.5">
                                        <Bell className="h-4 w-4 text-[#45474c] mt-0.5 shrink-0" />
                                        <div>
                                            <div className="text-sm font-semibold text-[#1b1b1d]">Immediate notification</div>
                                            <p className="text-xs text-[#45474c] mt-0.5">Send an email when a reminder is created.</p>
                                        </div>
                                    </div>
                                    <Switch checked={immediateOnCreate} onCheckedChange={(v) => { setImmediateOnCreate(v); setAppDirty(true) }} disabled={isSandboxFirm || !loaded} aria-label="Immediate notification on create" />
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-start gap-2.5">
                                        <RefreshCw className="h-4 w-4 text-[#45474c] mt-0.5 shrink-0" />
                                        <div>
                                            <div className="text-sm font-semibold text-[#1b1b1d]">Recurring emails</div>
                                            <p className="text-xs text-[#45474c] mt-0.5">Send repeat reminder emails until marked done.</p>
                                        </div>
                                    </div>
                                    <Switch checked={recurringEnabled} onCheckedChange={(v) => { setRecurringEnabled(v); setAppDirty(true) }} disabled={isSandboxFirm || !loaded} aria-label="Recurring reminder emails" />
                                </div>
                                {recurringEnabled && (
                                    <div className="pl-6 space-y-2 border-l-2 border-[#f0f0f2] ml-2">
                                        <div>
                                            <label className={fieldLabel}>Frequency (every N days)</label>
                                            <Select value={String(recurringFrequencyDays)} onValueChange={(v) => { setRecurringFrequencyDays(Number(v)); setAppDirty(true) }} disabled={isSandboxFirm || !loaded}>
                                                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                                <SelectContent>{[1, 3, 7, 14].map((n) => <SelectItem key={n} value={String(n)}>{n === 1 ? 'Every day' : `Every ${n} days`}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <label className={fieldLabel}>Start before due date</label>
                                            <Select value={String(startDaysBeforeDue)} onValueChange={(v) => { setStartDaysBeforeDue(Number(v)); setAppDirty(true) }} disabled={isSandboxFirm || !loaded}>
                                                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                                <SelectContent>{[1, 3, 7, 14, 21, 30].map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'day' : 'days'} before</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Beta features */}
                            <div className="bg-white rounded border border-[#e5e7eb] p-4">
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
                                    <Switch checked={enableBetaFeatures} onCheckedChange={(v) => { setEnableBetaFeatures(v); setAppDirty(true) }} disabled={isSandboxFirm || !loaded} aria-label="Enable beta features" />
                                </div>
                            </div>

                            </div>{/* end grid */}
                            {appSave}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 4. DOCUMENT STORAGE ── */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('storage')}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#fafafa' }}>
                    <div className="flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5 text-[#45474c]" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1b1b1d]">Document Storage</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'storage' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'storage' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                        <div className="p-5 border-t border-[#e5e7eb] bg-white">
                            {orgId
                                ? <FirmDriveSection firmId={orgId} orgSlug={orgSlug} isSandboxFirm={isSandboxFirm} onConnectorsLoaded={setStorageConnectorCount} />
                                : <div className="text-xs text-[#9a9ba0]">Loading…</div>
                            }
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 5. DANGER ZONE ── */}
            <section className="border border-red-200 rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('danger')}
                    className="w-full px-5 py-3 flex items-center justify-between gap-2 bg-red-50/60 hover:bg-red-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-800">Danger zone</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-red-500 transition-transform duration-200 ${openSection === 'danger' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'danger' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                        <div className="p-5 border-t border-red-200 bg-red-50/40">
                            <p className="text-sm text-[#45474c] mb-4">Permanently delete this firm. All clients, projects, and members will be removed. This cannot be undone.</p>
                            <Button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={isSandboxFirm || deleting}
                                className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase shadow-sm hover:shadow-[0_4px_12px_-2px_rgba(185,28,28,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all">
                                {deleting ? 'Deleting…' : 'Delete firm'}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Delete firm"
                subtitle="This action cannot be undone."
                description="Permanently delete this organization? All clients, projects, and members will be removed. This cannot be undone."
                confirmLabel="Delete firm"
                confirmVariant="red"
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={() => void performDeleteFirm()}
                loading={deleting}
            />
        </div>
    )
}
