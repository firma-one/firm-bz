'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { AlertTriangle, ImageIcon, Palette, Trash2, ImagePlus, ChevronDown, Check, FlaskConical, Info } from 'lucide-react'
import { contrastRatioAgainstWhite } from '@/lib/color-utils'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
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
    const [enableBetaFeatures, setEnableBetaFeatures] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [dangerOpen, setDangerOpen] = useState(false)
    const [brandingLoaded, setBrandingLoaded] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })
    const previewSize = 160

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
                    setSubtext(b.subtext ?? '')
                    setWebsite(b.website ?? '')
                    setThemeColor(b.primaryColor ?? '')
                    setSecondaryColor(b.secondaryColor ?? '')
                    setEnableBetaFeatures(settings.enableBetaFeatures === true)
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
        if (!(logoPreviewUrl || logoUrl) || !logoFile) return
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

    const exportLogoToSquareBlob = (): Promise<Blob | null> => {
        if (!logoPreviewUrl || !isRasterLogo) return Promise.resolve(null)
        return new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                const size = 400
                const canvas = document.createElement('canvas')
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }
                const scaleToFit = Math.min(size / img.naturalWidth, size / img.naturalHeight)
                const w = img.naturalWidth * scaleToFit
                const h = img.naturalHeight * scaleToFit
                const scale = size / previewSize
                ctx.save()
                ctx.translate(logoX * scale, logoY * scale)
                ctx.translate(size / 2, size / 2)
                ctx.scale(logoScale, logoScale)
                ctx.translate(-size / 2, -size / 2)
                ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
                ctx.restore()
                canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95)
            }
            img.onerror = () => resolve(null)
            img.src = logoPreviewUrl
        })
    }

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
                        ? await exportLogoToSquareBlob().then((blob) => (blob ? new File([blob], 'logo.png', { type: 'image/png' }) : logoFile))
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
            })
            addToast({ type: 'success', title: 'Saved', message: 'Firm details updated.' })
            onSaved?.()
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('firm-branding-updated'))
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

    const fieldLabel = 'text-xs font-semibold text-[#45474c] uppercase tracking-widest'
    const fieldInput = 'bg-white border-[#e5e7eb] text-[#1b1b1d] placeholder:text-[#9a9ba0] focus-visible:ring-primary/30 rounded disabled:cursor-not-allowed disabled:opacity-60'

    return (
        <div className="flex flex-col gap-4">
            {isSandboxFirm && <SandboxInfoBanner />}

                {/* Tile grid */}
                <div className="grid grid-cols-3 gap-3">

                    {/* IDENTITY — col-span-2 */}
                    <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#9a9ba0]">Identity</p>
                        <div className="space-y-1.5">
                            <Label htmlFor="org-name" className={fieldLabel}>
                                Firm name <span className="text-red-500 normal-case tracking-normal">*</span>
                            </Label>
                            <Input
                                id="org-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Firm name"
                                disabled={isSandboxFirm}
                                className={fieldInput}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="org-subtext" className={fieldLabel}>
                                Brand Tagline <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <Input
                                id="org-subtext"
                                value={subtext}
                                onChange={(e) => setSubtext(e.target.value)}
                                placeholder="Optional tagline or subtext"
                                disabled={isSandboxFirm}
                                className={fieldInput}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="org-website" className={fieldLabel}>
                                Website <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <Input
                                id="org-website"
                                type="url"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder="https://yourfirm.com"
                                disabled={isSandboxFirm}
                                className={fieldInput}
                            />
                            <p className="text-xs text-[#9a9ba0]">Used as a link on the logo or avatar in the portal.</p>
                        </div>
                    </div>

                    {/* BRANDING — col-span-1 */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#9a9ba0]">Branding</p>
                        <div className="space-y-1.5">
                            <Label htmlFor="org-logo" className={`${fieldLabel} flex items-center gap-1.5`}>
                                <ImageIcon className="h-3 w-3" />
                                Logo <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <p className="text-xs text-[#9a9ba0]">JPG, PNG or SVG. 200×200 px, max 5 MB.</p>
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
                                {!(logoPreviewUrl || logoUrl) ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative flex shrink-0 items-center justify-center rounded border-2 border-dashed border-[#e5e7eb] bg-slate-50 hover:border-primary/40 transition-colors focus:outline-none group"
                                        style={{ width: previewSize, height: previewSize }}
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
                                            className={`relative flex shrink-0 rounded border border-[#e5e7eb] bg-[#f9f9fb] overflow-hidden select-none group ${logoFile ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                            style={{ width: previewSize, height: previewSize }}
                                            title={logoFile ? 'Drag to move, use slider to zoom.' : 'Shown in portal header'}
                                            {...(logoFile && !isSandboxFirm
                                                ? { onPointerDown: onPreviewPointerDown, onPointerMove: onPreviewPointerMove, onPointerUp: onPreviewPointerUp, onPointerLeave: onPreviewPointerUp }
                                                : {})}
                                        >
                                            <div className="absolute inset-0 flex items-center justify-center"
                                                style={{ transform: `translate(${logoX}px, ${logoY}px) scale(${logoScale})` }}>
                                                <img src={logoPreviewUrl || logoUrl} alt="Logo preview"
                                                    className="max-w-full max-h-full object-contain pointer-events-none"
                                                    style={{ width: previewSize, height: previewSize }} draggable={false} />
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
                                        {logoFile && (
                                            <div className="flex items-center gap-2" style={{ width: previewSize }}>
                                                <span className="text-xs text-[#45474c] whitespace-nowrap">Zoom</span>
                                                <input type="range" min={0.5} max={3} step={0.1} value={logoScale}
                                                    onChange={(e) => setLogoScale(Number(e.target.value))} disabled={isSandboxFirm}
                                                    className="flex-1 h-1.5 rounded appearance-none bg-[#e5e7eb] accent-primary disabled:opacity-60" />
                                                <button type="button" onClick={() => { setLogoScale(1); setLogoX(0); setLogoY(0) }}
                                                    disabled={isSandboxFirm} className="text-xs text-[#45474c] hover:text-[#1b1b1d] underline disabled:opacity-50">
                                                    Reset
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </TooltipProvider>
                        </div>
                        {/* Reset to Firma theme */}
                        {(themeColor || secondaryColor) && !isSandboxFirm && (
                            <div className="flex items-center justify-between py-1 border-b border-[#f3f4f6]">
                                <span className="text-[11px] text-[#9a9ba0]">Custom colors active</span>
                                <button
                                    type="button"
                                    onClick={() => { setThemeColor(''); setSecondaryColor('') }}
                                    className="text-[11px] font-medium text-firma hover:text-firma/80 transition-colors"
                                >
                                    ↺ Reset to Firma theme
                                </button>
                            </div>
                        )}

                        {/* Brand Primary Color */}
                        <div className="space-y-1.5">
                            <Label htmlFor="org-primary-color" className={`${fieldLabel} flex items-center gap-1.5`}>
                                <Palette className="h-3 w-3" />
                                Brand Primary Color
                                <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <input id="org-primary-color" type="color"
                                    value={themeColor || '#069668'}
                                    onChange={(e) => setThemeColor(e.target.value)} disabled={isSandboxFirm}
                                    className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)}
                                    placeholder="Leave empty to use Firma default (#069668)"
                                    disabled={isSandboxFirm}
                                    className={`font-mono text-sm ${fieldInput}`} />
                                {themeColor && (
                                    <button type="button" onClick={() => setThemeColor('')}
                                        className="text-[#9a9ba0] hover:text-[#45474c] text-xs shrink-0">Reset</button>
                                )}
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
                            <Label htmlFor="org-accent-color" className={`${fieldLabel} flex items-center gap-1.5`}>
                                <Palette className="h-3 w-3" />
                                Brand Accent Color
                                <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <p className="text-[11px] text-[#9a9ba0]">Used for nav stripe &amp; tab underlines. Leave empty to match primary.</p>
                            <div className="flex items-center gap-2">
                                <input id="org-accent-color" type="color"
                                    value={secondaryColor || themeColor || '#069668'}
                                    onChange={(e) => setSecondaryColor(e.target.value)} disabled={isSandboxFirm}
                                    className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                                    placeholder="Leave empty to match primary color"
                                    disabled={isSandboxFirm}
                                    className={`font-mono text-sm ${fieldInput}`} />
                                {secondaryColor && (
                                    <button type="button" onClick={() => setSecondaryColor('')}
                                        className="text-[#9a9ba0] hover:text-[#45474c] text-xs shrink-0">Clear</button>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* REGIONAL — col-span-1 */}
                    <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#9a9ba0]">Regional</p>
                        <div className="space-y-1.5">
                            <Label className={fieldLabel}>
                                Currency <span className="text-[#9a9ba0] normal-case tracking-normal font-normal">(optional)</span>
                            </Label>
                            <DropdownMenu open={currencyOpen} onOpenChange={setCurrencyOpen}>
                                <DropdownMenuTrigger asChild disabled={isSandboxFirm}>
                                    <button className="w-full h-9 flex items-center justify-between rounded border border-[#e5e7eb] bg-white px-3 text-sm text-[#1b1b1d] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/20">
                                        <span className={currencyCode || (currencyIsCustom && currencyCustom) ? 'text-[#1b1b1d]' : 'text-[#9a9ba0]'}>
                                            {currencyCode
                                                ? WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.label ?? currencyCode
                                                : currencyIsCustom && currencyCustom ? `Other: ${currencyCustom}` : 'Select…'}
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-[#45474c] shrink-0" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1 max-h-72 overflow-y-auto rounded" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    {(currencyCode || currencyIsCustom) && (
                                        <>
                                            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-sm rounded text-[#45474c] hover:text-red-600"
                                                onSelect={() => { setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false) }}>
                                                <span className="text-[#9a9ba0]">×</span> Clear selection
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                        </>
                                    )}
                                    {WORLD_CURRENCIES.map((cur) => (
                                        <DropdownMenuItem key={cur.code} className="flex items-center justify-between cursor-pointer text-sm rounded"
                                            onSelect={() => { setCurrencyCode(cur.code); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false) }}>
                                            {cur.label}
                                            {currencyCode === cur.code && !currencyIsCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <div className="px-2 py-1.5 flex items-center gap-2">
                                        <input value={currencyIsCustom ? currencyCustom : ''}
                                            onChange={(e) => { setCurrencyCustom(e.target.value); setCurrencyIsCustom(true); setCurrencyCode('') }}
                                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setCurrencyOpen(false) }}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="Other (enter symbol)…"
                                            className="flex-1 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] outline-none bg-transparent" />
                                        {currencyIsCustom && currencyCustom && <Check className="h-4 w-4 text-primary shrink-0" />}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <p className="text-xs text-[#9a9ba0]">Prefix on contract values.</p>
                        </div>
                    </div>

                    {/* FEATURES — col-span-2 */}
                    <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#9a9ba0] mb-3">Features</p>
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

                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase"
                        onClick={() => router.push(`/d/f/${orgSlug}?tab=clients`)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="greenCta" onClick={handleSave}
                        disabled={isSandboxFirm || saving || !brandingLoaded}
                        className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white">
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
                            className="rounded-[2px] bg-red-700 text-white hover:bg-red-800 border-0 shadow-sm hover:shadow-[0_4px_12px_-2px_rgba(185,28,28,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all"
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
