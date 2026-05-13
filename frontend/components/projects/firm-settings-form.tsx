'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { updateFirm, deleteFirm, type FirmCurrency } from '@/lib/actions/firms'
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
import { FileText, AlertTriangle, ImageIcon, Palette, Trash2, ImagePlus, ChevronDown, Check } from 'lucide-react'
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

const MAX_LOGO_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']

 export interface FirmSettingsFormProps {
    orgSlug: string
    orgId?: string | null
    initialName: string
    /** Server-known sandbox flag (optional; combined with client hook). */
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
    const [themeColor, setThemeColor] = useState('#6366f1')
    const [currencyOpen, setCurrencyOpen] = useState(false)
    const [currencyCode, setCurrencyCode] = useState('')
    const [currencyIsCustom, setCurrencyIsCustom] = useState(false)
    const [currencyCustom, setCurrencyCustom] = useState('')
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
    const [logoScale, setLogoScale] = useState(1)
    const [logoX, setLogoX] = useState(0)
    const [logoY, setLogoY] = useState(0)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [brandingLoaded, setBrandingLoaded] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })
    const previewSize = 160

    useEffect(() => {
        setName(initialName)
    }, [initialName])

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
                    setLogoUrl((firm?.logoUrl as string) ?? b.logoUrl ?? '')
                    setSubtext((firm?.brandingSubtext as string) ?? b.subtext ?? '')
                    setThemeColor((firm?.themeColorHex as string) ?? b.themeColor ?? b.brandColor ?? '#6366f1')
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
            } catch {
                // ignore
            } finally {
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
        if (!file) {
            setLogoFile(null)
            return
        }
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

    /** Export current logo view to a square PNG blob (for raster only). */
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
                // Pan in output pixels (same ratio as preview)
                ctx.translate(logoX * scale, logoY * scale)
                // Scale around canvas center so zoom matches preview
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
                    themeColor: themeColor || null,
                },
                currency: currencyIsCustom
                    ? { symbol: currencyCustom.trim() || null, code: null }
                    : currencyCode
                        ? { symbol: WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? null, code: currencyCode }
                        : { symbol: null, code: null },
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
        if (isSandboxFirm) return
        if (!orgId) return
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
            addToast({
                type: 'error',
                title: 'Remove logo failed',
                message: e instanceof Error ? e.message : 'Could not remove logo.',
            })
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
            addToast({
                type: 'error',
                title: 'Delete failed',
                message: e instanceof Error ? e.message : 'Could not delete firm.',
            })
        } finally {
            setDeleting(false)
        }
    }

    const buttonClass = 'min-w-[11rem] sm:w-[11rem]'

    return (
        <div className="space-y-0">
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Firm settings</h2>
                <p className="text-sm text-gray-500 mt-1">Edit details or remove the firm.</p>
            </div>

            {isSandboxFirm && (
                <div className="mb-6">
                    <SandboxInfoBanner />
                </div>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-6 mb-12">
                <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-gray-500" aria-hidden />
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Details</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">Only firm name is required. Logo, tagline, and theme are optional and shown in the top bar when set.</p>
                <div className="space-y-4 w-full">
                    <div className="space-y-2">
                        <Label htmlFor="org-name" className="text-gray-700 font-medium">Firm name <span className="text-red-500">*</span></Label>
                        <Input
                            id="org-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Firm name"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-subtext" className="text-gray-700 font-medium">Brand Tagline <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Input
                            id="org-subtext"
                            value={subtext}
                            onChange={(e) => setSubtext(e.target.value)}
                            placeholder="Optional tagline or subtext"
                            disabled={isSandboxFirm}
                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-logo" className="text-gray-700 font-medium flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Brand Logo <span className="text-gray-400 font-normal">(optional)</span>
                        </Label>
                        <p className="text-xs text-gray-500">JPG, PNG or SVG. Recommended 200×200 px, max 5 MB. Shown in the top bar when set.</p>
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
                            <div className="flex flex-col gap-2 w-full">
                                {!(logoPreviewUrl || logoUrl) ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
                                        style={{ width: previewSize, height: previewSize }}
                                    >
                                        <ImagePlus className="h-10 w-10" />
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className={`relative flex shrink-0 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden select-none group ${logoFile ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                            style={{ width: previewSize, height: previewSize }}
                                            title={logoFile ? 'Drag to move, use slider to zoom. This view is saved as the logo.' : 'Shown in portal header (top left)'}
                                            {...(logoFile && !isSandboxFirm
                                                ? {
                                                    onPointerDown: onPreviewPointerDown,
                                                    onPointerMove: onPreviewPointerMove,
                                                    onPointerUp: onPreviewPointerUp,
                                                    onPointerLeave: onPreviewPointerUp,
                                                }
                                                : {})}
                                        >
                                            <div
                                                className="absolute inset-0 flex items-center justify-center"
                                                style={{
                                                    transform: `translate(${logoX}px, ${logoY}px) scale(${logoScale})`,
                                                }}
                                            >
                                                <img
                                                    src={logoPreviewUrl || logoUrl}
                                                    alt="Logo preview"
                                                    className="max-w-full max-h-full object-contain pointer-events-none"
                                                    style={{ width: previewSize, height: previewSize }}
                                                    draggable={false}
                                                />
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            onClick={() => !isSandboxFirm && fileInputRef.current?.click()}
                                                            disabled={isSandboxFirm}
                                                            className="p-2 rounded-lg bg-white text-gray-700 hover:bg-gray-100 shadow-sm disabled:opacity-50"
                                                            aria-label="Replace logo"
                                                        >
                                                            <ImagePlus className="h-5 w-5" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Replace logo</TooltipContent>
                                                </Tooltip>
                                                {orgId && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                onClick={handleRemoveLogo}
                                                                disabled={isSandboxFirm}
                                                                className="p-2 rounded-lg bg-white text-red-600 hover:bg-red-50 shadow-sm disabled:opacity-50"
                                                                aria-label="Remove logo"
                                                            >
                                                                <Trash2 className="h-5 w-5" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Remove logo</TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </div>
                                        {logoFile && (
                                            <div className="flex flex-col gap-1" style={{ width: previewSize }}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">Zoom</span>
                                                    <input
                                                        type="range"
                                                        min={0.5}
                                                        max={3}
                                                        step={0.1}
                                                        value={logoScale}
                                                        onChange={(e) => setLogoScale(Number(e.target.value))}
                                                        disabled={isSandboxFirm}
                                                        className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-gray-700 disabled:opacity-60"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => { setLogoScale(1); setLogoX(0); setLogoY(0) }}
                                                        disabled={isSandboxFirm}
                                                        className="text-xs text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
                                                    >
                                                        Reset
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-500">Drag logo to position. Save to apply.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </TooltipProvider>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="org-theme" className="text-gray-700 font-medium flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Brand Theme color
                        </Label>
                        <div className="flex items-center gap-3">
                            <input
                                id="org-theme"
                                type="color"
                                value={themeColor}
                                onChange={(e) => setThemeColor(e.target.value)}
                                disabled={isSandboxFirm}
                                className="h-10 w-14 rounded border border-gray-200 cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <Input
                                value={themeColor}
                                onChange={(e) => setThemeColor(e.target.value)}
                                placeholder="#6366f1"
                                disabled={isSandboxFirm}
                                className="max-w-[8rem] font-mono text-sm bg-white border-gray-200 text-gray-900 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-gray-700 font-medium">
                            Currency <span className="text-gray-400 font-normal">(optional)</span>
                        </Label>
                        <DropdownMenu open={currencyOpen} onOpenChange={setCurrencyOpen}>
                            <DropdownMenuTrigger asChild disabled={isSandboxFirm}>
                                <button className="w-full h-10 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                                    <span className={currencyCode || (currencyIsCustom && currencyCustom) ? 'text-gray-900' : 'text-gray-400'}>
                                        {currencyCode
                                            ? WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.label ?? currencyCode
                                            : currencyIsCustom && currencyCustom
                                                ? `Other: ${currencyCustom}`
                                                : 'Select currency…'}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-[var(--radix-dropdown-menu-trigger-width)] p-1 max-h-72 overflow-y-auto"
                                onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                                {WORLD_CURRENCIES.map((cur) => (
                                    <DropdownMenuItem
                                        key={cur.code}
                                        className="flex items-center justify-between cursor-pointer"
                                        onSelect={() => {
                                            setCurrencyCode(cur.code)
                                            setCurrencyIsCustom(false)
                                            setCurrencyCustom('')
                                            setCurrencyOpen(false)
                                        }}
                                    >
                                        {cur.label}
                                        {currencyCode === cur.code && !currencyIsCustom && (
                                            <Check className="h-4 w-4 text-gray-700 shrink-0" />
                                        )}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <div className="px-2 py-1.5 flex items-center gap-2">
                                    <input
                                        value={currencyIsCustom ? currencyCustom : ''}
                                        onChange={(e) => {
                                            setCurrencyCustom(e.target.value)
                                            setCurrencyIsCustom(true)
                                            setCurrencyCode('')
                                        }}
                                        onKeyDown={(e) => {
                                            e.stopPropagation()
                                            if (e.key === 'Enter') setCurrencyOpen(false)
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Other (enter symbol)…"
                                        className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
                                    />
                                    {currencyIsCustom && currencyCustom && (
                                        <Check className="h-4 w-4 text-gray-700 shrink-0" />
                                    )}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="text-xs text-gray-400">Symbol shown as prefix on all contract values.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className={buttonClass}
                            onClick={() => router.push(`/d/f/${orgSlug}?tab=clients`)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSandboxFirm || saving || !brandingLoaded}
                            className={`${buttonClass} bg-gray-900 text-white hover:bg-black`}
                        >
                            {saving ? 'Saving...' : 'Save changes'}
                        </Button>
                    </div>
                </div>
            </section>

            <div className="py-4">
                <section className="rounded-lg border border-red-200 bg-red-50/50 p-6">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
                        <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wide">Danger zone</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                        Permanently delete this firm. All clients, projects, and members will be removed. This cannot be undone.
                    </p>
                    <Button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={isSandboxFirm || deleting}
                        className={`${buttonClass} bg-red-800 text-white hover:bg-red-900 border-0`}
                    >
                        {deleting ? 'Deleting...' : 'Delete firm'}
                    </Button>
                </section>
            </div>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Delete firm?</DialogTitle>
                        <DialogDescription className="text-slate-600">
                            Permanently delete this organization? All clients, projects, and members will be removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-gray-200 text-gray-700 hover:bg-gray-50"
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
                            {deleting ? 'Deleting...' : 'Delete firm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
