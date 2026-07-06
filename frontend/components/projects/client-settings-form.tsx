'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { updateClient, deleteClient, upsertClientBrand, type LwCrmClientStatus } from '@/lib/actions/client'
import { getFirmMembers } from '@/lib/actions/firm-members'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/lib/auth-context'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, ChevronDown, ImageIcon, ImagePlus, Info, Lock, Linkedin, Palette, RotateCcw, Trash2, Type, Users2, MapPin, X, CornerDownLeft, User, Activity, Building2, Globe, FileText, Tag, Share2, CalendarClock, CalendarCheck } from 'lucide-react'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { ClientDriveSection } from '@/components/connectors/client-drive-section'
import { contrastRatioAgainstWhite } from '@/lib/color-utils'
import { FIRMA_COLOR } from '@/config/brand'

const MAX_LOGO_SIZE = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']

export interface ClientSettingsFormProps {
    orgSlug: string
    firmId?: string
    clientId?: string
    clientSlug: string
    connectorId?: string | null
    initialName: string
    initialIndustry?: string
    initialStatus?: LwCrmClientStatus
    initialWebsite?: string
    initialDescription?: string
    initialTags?: string[]
    initialOwnerId?: string | null
    initialFollowUpDate?: string
    initialExpectedCloseDate?: string
    initialLeadSource?: string
    initialInternalMemo?: string
    initialClientSinceDate?: string
    initialLinkedInUrl?: string
    initialCompanySizeBracket?: string
    initialBillingAddress?: string
    firmSandboxOnly?: boolean
    onSaved?: () => void
}

const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'
const textareaCls = 'flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-normal text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

export function ClientSettingsForm({
    orgSlug,
    firmId,
    clientId,
    clientSlug,
    connectorId,
    initialName,
    initialIndustry = '',
    initialStatus = 'ACTIVE',
    initialWebsite = '',
    initialDescription = '',
    initialTags = [],
    initialOwnerId = null,
    initialFollowUpDate = '',
    initialExpectedCloseDate = '',
    initialLeadSource = '',
    initialInternalMemo = '',
    initialClientSinceDate = '',
    initialLinkedInUrl = '',
    initialCompanySizeBracket = '',
    initialBillingAddress = '',
    firmSandboxOnly = false,
    onSaved,
}: ClientSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const { user } = useAuth()
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const [detailsDirty, setDetailsDirty] = useState(false)
    const [brandDirty, setBrandDirty] = useState(false)
    const [name, setName] = useState(initialName)
    const [industry, setIndustry] = useState(initialIndustry)
    const [status, setStatus] = useState<LwCrmClientStatus>(initialStatus)
    const [website, setWebsite] = useState(initialWebsite)
    const [description, setDescription] = useState(initialDescription)
    const [tags, setTags] = useState<string[]>(initialTags)
    const [tagInput, setTagInput] = useState('')
    const tagInputRef = useRef<HTMLInputElement>(null)
    const [ownerId, setOwnerId] = useState<string | null>(initialOwnerId ?? null)
    const [followUpDate, setFollowUpDate] = useState(initialFollowUpDate)
    const [expectedCloseDate, setExpectedCloseDate] = useState(initialExpectedCloseDate)
    const [leadSource, setLeadSource] = useState(initialLeadSource)
    const [internalMemo, setInternalMemo] = useState(initialInternalMemo)
    const [clientSinceDate, setClientSinceDate] = useState(initialClientSinceDate)
    const [linkedInUrl, setLinkedInUrl] = useState(initialLinkedInUrl)
    const [companySizeBracket, setCompanySizeBracket] = useState(initialCompanySizeBracket)
    const [billingAddress, setBillingAddress] = useState(initialBillingAddress)
    const [memberOptions, setMemberOptions] = useState<{ userId: string; label: string }[]>([])

    // Dirty-aware setters for Details section
    const setNameD = (v: string) => { setName(v); setDetailsDirty(true) }
    const setIndustryD = (v: string) => { setIndustry(v); setDetailsDirty(true) }
    const setStatusD = (v: LwCrmClientStatus) => { setStatus(v); setDetailsDirty(true) }
    const setWebsiteD = (v: string) => { setWebsite(v); setDetailsDirty(true) }
    const setDescriptionD = (v: string) => { setDescription(v); setDetailsDirty(true) }
    const setTagsD = (v: string[]) => { setTags(v); setDetailsDirty(true) }
    const setOwnerIdD = (v: string | null) => { setOwnerId(v); setDetailsDirty(true) }
    const setFollowUpDateD = (v: string) => { setFollowUpDate(v); setDetailsDirty(true) }
    const setExpectedCloseDateD = (v: string) => { setExpectedCloseDate(v); setDetailsDirty(true) }
    const setLeadSourceD = (v: string) => { setLeadSource(v); setDetailsDirty(true) }
    const setInternalMemoD = (v: string) => { setInternalMemo(v); setDetailsDirty(true) }
    const setClientSinceDateD = (v: string) => { setClientSinceDate(v); setDetailsDirty(true) }
    const setLinkedInUrlD = (v: string) => { setLinkedInUrl(v); setDetailsDirty(true) }
    const setCompanySizeBracketD = (v: string) => { setCompanySizeBracket(v); setDetailsDirty(true) }
    const setBillingAddressD = (v: string) => { setBillingAddress(v); setDetailsDirty(true) }

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

    // Dirty-aware setters for Branding section
    const setBrandNameD = (v: string) => { setBrandName(v); setBrandDirty(true) }
    const setBrandSubtextD = (v: string) => { setBrandSubtext(v); setBrandDirty(true) }
    const setBrandPrimaryColorD = (v: string) => { setBrandPrimaryColor(v); setBrandDirty(true) }
    const setBrandSecondaryColorD = (v: string) => { setBrandSecondaryColor(v); setBrandDirty(true) }
    const setBrandLogoAspectRatioD = (v: '1:1' | '4:3' | '16:9') => { setBrandLogoAspectRatio(v); setBrandDirty(true) }
    const [brandLoaded, setBrandLoaded] = useState(false)
    // false = use firm branding (default); true = use custom client branding
    const [useCustomBranding, setUseCustomBranding] = useState(false)
    const [savingBrand, setSavingBrand] = useState(false)
    const brandFileInputRef = useRef<HTMLInputElement>(null)
    const brandDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLogoX: 0, startLogoY: 0 })

    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    type Section = 'details' | 'drive' | 'branding' | 'danger'
    const [openSection, setOpenSection] = useState<Section>('details')
    const toggleSection = (s: Section) => setOpenSection((prev) => (prev === s ? 'drive' : s))
    const accentColor = brandPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryColor) ? brandPrimaryColor : null
    const sectionHeaderStyle = accentColor ? { backgroundColor: `${accentColor}0f` } : undefined

    useEffect(() => {
        setName(initialName)
        setIndustry(initialIndustry ?? '')
        setStatus(initialStatus ?? 'ACTIVE')
        setWebsite(initialWebsite ?? '')
        setDescription(initialDescription ?? '')
        setTags(initialTags)
        setOwnerId(initialOwnerId ?? null)
        setFollowUpDate(initialFollowUpDate ?? '')
        setExpectedCloseDate(initialExpectedCloseDate ?? '')
        setLeadSource(initialLeadSource ?? '')
        setInternalMemo(initialInternalMemo ?? '')
        setClientSinceDate(initialClientSinceDate ?? '')
        setLinkedInUrl(initialLinkedInUrl ?? '')
        setCompanySizeBracket(initialCompanySizeBracket ?? '')
        setBillingAddress(initialBillingAddress ?? '')
        setDetailsDirty(false)
    }, [initialName, initialIndustry, initialStatus, initialWebsite, initialDescription, initialTags, initialOwnerId, initialFollowUpDate, initialExpectedCloseDate, initialLeadSource, initialInternalMemo, initialClientSinceDate, initialLinkedInUrl, initialCompanySizeBracket, initialBillingAddress])

    // Warn before navigating away with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (detailsDirty || brandDirty) { e.preventDefault() }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [detailsDirty, brandDirty])

    useEffect(() => {
        if (!firmId) return
        getFirmMembers(firmId)
            .then((res) => setMemberOptions(res.members.map((m) => ({ userId: m.userId, label: m.user?.name || m.user?.email || m.userId }))))
            .catch(() => setMemberOptions([]))
    }, [firmId])

    // Load brand on mount
    useEffect(() => {
        if (!clientId) { setBrandLoaded(true); return }
        fetch(`/api/clients/${clientId}/brand`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                const b = data?.brand
                if (b) {
                    setUseCustomBranding(true)
                    setBrandName(b.name ?? '')
                    setBrandSubtext(b.subtext ?? '')
                    setBrandPrimaryColor(b.primaryColor ?? '')
                    setBrandSecondaryColor(b.secondaryColor ?? '')
                    // logoData is a base64 data URL — use directly as preview
                    if (b.logoData) {
                        setBrandLogoUrl(b.logoData)
                    } else {
                        setBrandLogoUrl(b.logoUrl ?? '')
                    }
                    const ar = b.logoAspectRatio
                    setBrandLogoAspectRatio(ar === '4:3' || ar === '16:9' ? ar : '1:1')
                } else {
                    setUseCustomBranding(false)
                }
                setBrandDirty(false)
            })
            .catch(() => {})
            .finally(() => setBrandLoaded(true))
    }, [clientId])

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
        if (!ALLOWED_LOGO_TYPES.includes(type)) { addToast({ type: 'error', title: 'Invalid file', message: 'Use JPG, PNG, or SVG.' }); return }
        if (file.size > MAX_LOGO_SIZE) { addToast({ type: 'error', title: 'File too large', message: 'Logo must be under 5 MB.' }); return }
        setBrandLogoFile(file)
        setBrandLogoScale(1)
        setBrandLogoX(0)
        setBrandLogoY(0)
        setBrandDirty(true)
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
        setBrandDirty(true)
    }
    const onBrandPointerUp = (e: React.PointerEvent) => {
        if (brandDragRef.current.isDragging) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        brandDragRef.current.isDragging = false
    }

    const BRAND_PREVIEW_H = 160
    const brandAspectMap = { '1:1': 1, '4:3': 4/3, '16:9': 16/9 } as const
    const brandPreviewW = Math.round(BRAND_PREVIEW_H * brandAspectMap[brandLogoAspectRatio])
    const isRasterBrandLogo = brandLogoFile?.type === 'image/png' || brandLogoFile?.type === 'image/jpeg' || brandLogoFile?.type === 'image/jpg'

    const exportBrandLogoToBlob = (): Promise<Blob | null> => {
        if (!brandLogoPreviewUrl || !isRasterBrandLogo) return Promise.resolve(null)
        // Export at the container's aspect ratio so Logo component renders it identically to the preview.
        // The canvas IS the container — image is drawn object-contain inside it with user pan/zoom applied.
        const exportH = 400
        const exportW = Math.round(exportH * brandAspectMap[brandLogoAspectRatio])
        return new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = exportW; canvas.height = exportH
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }
                // Match the preview: scale image to fit the canvas (object-contain)
                const scale = exportH / BRAND_PREVIEW_H
                const previewW = Math.round(BRAND_PREVIEW_H * brandAspectMap[brandLogoAspectRatio])
                const fitScale = Math.min(previewW / img.naturalWidth, BRAND_PREVIEW_H / img.naturalHeight) * scale
                const drawW = img.naturalWidth * fitScale
                const drawH = img.naturalHeight * fitScale
                ctx.save()
                ctx.translate(
                    exportW / 2 + brandLogoX * scale,
                    exportH / 2 + brandLogoY * scale,
                )
                ctx.scale(brandLogoScale, brandLogoScale)
                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
                ctx.restore()
                canvas.toBlob((b) => resolve(b), 'image/png', 0.92)
            }
            img.onerror = () => resolve(null)
            img.src = brandLogoPreviewUrl
        })
    }

    const handleSaveBrand = async () => {
        if (!clientId || isSandboxFirm) return
        setSavingBrand(true)
        try {
            if (!useCustomBranding) {
                // Toggle OFF: delete brand record (fall back to firm branding)
                await upsertClientBrand(clientId, null)
            } else {
                // Convert new file to base64 data URL if present
                let logoData: string | null = null
                if (brandLogoFile) {
                    if (isRasterBrandLogo) {
                        const blob = await exportBrandLogoToBlob()
                        if (blob) {
                            logoData = await new Promise<string>((res) => {
                                const reader = new FileReader()
                                reader.onload = () => res(reader.result as string)
                                reader.readAsDataURL(blob)
                            })
                        }
                    }
                    if (!logoData) {
                        logoData = await new Promise<string>((res) => {
                            const reader = new FileReader()
                            reader.onload = () => res(reader.result as string)
                            reader.readAsDataURL(brandLogoFile)
                        })
                    }
                } else if (brandLogoUrl?.startsWith('data:')) {
                    logoData = brandLogoUrl
                }

                await upsertClientBrand(clientId, {
                    name: brandName || null,
                    subtext: brandSubtext || null,
                    logoData,
                    logoAspectRatio: brandLogoAspectRatio,
                    primaryColor: brandPrimaryColor || null,
                    secondaryColor: brandSecondaryColor || null,
                })
                if (logoData) setBrandLogoUrl(logoData)
                setBrandLogoFile(null)
                setBrandLogoPreviewUrl(null)
            }
            setBrandDirty(false)
            addToast({ type: 'success', title: 'Branding saved', message: 'Client branding updated.' })
            window.dispatchEvent(new CustomEvent('client-branding-updated'))
        } catch (e) {
            addToast({ type: 'error', title: 'Save failed', message: e instanceof Error ? e.message : 'Could not save branding.' })
        } finally {
            setSavingBrand(false)
        }
    }

    const handleRemoveBrandLogo = () => {
        setBrandLogoUrl('')
        setBrandLogoFile(null)
        setBrandLogoPreviewUrl(null)
        setBrandDirty(true)
    }

    const commitTag = (raw: string) => {
        const value = raw.trim().toLowerCase().replace(/\s+/g, '-')
        if (value && !tags.includes(value)) setTagsD([...tags, value])
        setTagInput('')
    }
    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); commitTag(tagInput) }
        else if (e.key === ',') { e.preventDefault(); commitTag(tagInput) }
        else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1))
    }
    const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val.endsWith(',')) commitTag(val.slice(0, -1))
        else setTagInput(val)
    }
    const removeTag = (tag: string) => {
        setTagsD(tags.filter((t) => t !== tag))
        tagInputRef.current?.focus()
    }

    const handleSave = async () => {
        if (isSandboxFirm) return
        setSaving(true)
        try {
            await updateClient(orgSlug, clientSlug, {
                name,
                industry: industry || undefined,
                status,
                website: website.trim() || null,
                description: description.trim() || null,
                tags: tagInput.trim() ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')] : tags,
                ownerId,
                followUpDate: followUpDate || null,
                expectedCloseDate: expectedCloseDate || null,
                leadSource: leadSource || null,
                internalMemo: internalMemo.trim() || null,
                clientSinceDate: clientSinceDate || null,
                linkedInUrl: linkedInUrl.trim() || null,
                companySizeBracket: companySizeBracket || null,
                billingAddress: billingAddress.trim() || null,
            })
            setDetailsDirty(false)
            addToast({ type: 'success', title: 'Saved', message: 'Client details updated.' })
            window.dispatchEvent(new CustomEvent('firma-reminders-updated'))
            onSaved?.()
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Update failed', message: e instanceof Error ? e.message : 'Could not update client.' })
        } finally {
            setSaving(false)
        }
    }

    const performDeleteClient = async () => {
        if (isSandboxFirm) return
        setDeleting(true)
        try {
            await deleteClient(orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Client deleted', message: 'Client has been removed.' })
            setDeleteConfirmOpen(false)
            onSaved?.()
            router.push(`/d/f/${orgSlug}?tab=clients`)
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Could not delete client.' })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {isSandboxFirm && <SandboxInfoBanner />}

            {/* Details section */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('details')} className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#ffffff' }}>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Details</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'details' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'details' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                    <div className="p-4 bg-[#f9fafb] border-t border-[#e5e7eb] space-y-4">

            {/* Tile grid */}
            <div className="grid grid-cols-3 gap-3">

                {/* IDENTITY — col-span-2 */}
                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Identity</p>

                    {/* Row 1: Name (3/4) + Status (1/4) */}
                    <div className="grid grid-cols-[3fr_1fr] gap-3">
                        <div>
                            <label htmlFor="client-name" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                            </label>
                            <Input id="client-name" value={name} onChange={(e) => setNameD(e.target.value)} placeholder="Client name" disabled={isSandboxFirm} className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="client-status" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> Status <span className="text-red-500 normal-case tracking-normal font-sans">*</span></span>
                            </label>
                            <Select value={status} onValueChange={(v) => setStatusD(v as LwCrmClientStatus)} disabled={isSandboxFirm}>
                                <SelectTrigger id="client-status" className={[
                                    inputCls,
                                    status === 'ACTIVE'   ? 'bg-green-50  border-green-200  text-green-800'  : '',
                                    status === 'PROSPECT' ? 'bg-blue-50   border-blue-200   text-blue-800'   : '',
                                    status === 'ON_HOLD'  ? 'bg-amber-50  border-amber-200  text-amber-800'  : '',
                                    status === 'PAST'     ? 'bg-rose-50   border-rose-200   text-rose-800'   : '',
                                ].join(' ')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded border border-[#e5e7eb] bg-white shadow-md py-0.5 min-w-[var(--radix-select-trigger-width)]">
                                    <SelectItem value="PROSPECT" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Prospect</SelectItem>
                                    <SelectItem value="ACTIVE" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Active</SelectItem>
                                    <SelectItem value="ON_HOLD" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">On hold</SelectItem>
                                    <SelectItem value="PAST" className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]">Past</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                </div>

                {/* COMPANY — col-span-1, spans both left rows */}
                <div className="row-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>Company</p>

                    {/* Industry */}
                    <div>
                        <label htmlFor="client-industry" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Industry</span>
                        </label>
                        <Input id="client-industry" value={industry} onChange={(e) => setIndustryD(e.target.value)} placeholder="e.g. Technology" disabled={isSandboxFirm} className={inputCls} />
                    </div>

                    {/* Company size */}
                    <div>
                        <label htmlFor="client-company-size" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Company size</span>
                        </label>
                        <SelectWithCustomEntry id="client-company-size" value={companySizeBracket} onChange={setCompanySizeBracketD} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Select size bracket…" customEntryHint="Custom…" disabled={isSandboxFirm} />
                    </div>

                    {/* Website */}
                    <div>
                        <label htmlFor="client-website" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span>
                        </label>
                        <Input id="client-website" value={website} onChange={(e) => setWebsiteD(e.target.value)} placeholder="https://…" disabled={isSandboxFirm} className={inputCls} />
                    </div>

                    {/* LinkedIn */}
                    <div>
                        <label htmlFor="client-linkedin" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</span>
                        </label>
                        <Input id="client-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrlD(e.target.value)} placeholder="https://linkedin.com/company/…" disabled={isSandboxFirm} className={inputCls} />
                    </div>

                    {/* Billing address */}
                    <div>
                        <label htmlFor="client-billing-address" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Billing address</span>
                        </label>
                        <textarea id="client-billing-address" value={billingAddress} onChange={(e) => setBillingAddressD(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={2} disabled={isSandboxFirm} className={textareaCls} />
                    </div>

                    {/* Notes (description) */}
                    <div>
                        <label htmlFor="client-description" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</span>
                        </label>
                        <textarea id="client-description" value={description} onChange={(e) => setDescriptionD(e.target.value)} placeholder="Additional details about the client" rows={2} disabled={isSandboxFirm} className={textareaCls} />
                    </div>
                </div>

                {/* CRM — col-span-2, always visible */}
                <div className="col-span-2 bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                    <p className={fieldLabel}>CRM</p>

                    {/* Row 1: Lead Source + Tags */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="client-lead-source" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> Lead source</span>
                            </label>
                            <SelectWithCustomEntry id="client-lead-source" value={leadSource} onChange={setLeadSourceD} options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']} placeholder="Select source…" customEntryHint="Other…" disabled={isSandboxFirm} />
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">How did you acquire the lead?</p>
                        </div>
                        <div>
                            <label htmlFor="client-tags" className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</span>
                            </label>
                            <div
                                className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 transition-colors cursor-text ${isSandboxFirm ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed' : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'}`}
                                onClick={() => tagInputRef.current?.focus()}
                            >
                                {tags.map((tag) => (
                                    <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                                        {tag}
                                        {!isSandboxFirm && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                                                <X className="h-3 w-3" />
                                            </button>
                                        )}
                                    </span>
                                ))}
                                <input ref={tagInputRef} id="client-tags" value={tagInput} onChange={handleTagChange} onKeyDown={handleTagKeyDown} onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }} placeholder={tags.length === 0 ? 'Type a tag e.g. "high-priority"; press Enter or comma…' : ''} disabled={isSandboxFirm} className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed" />
                                <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Follow-up date + Lead Conversion Date (disabled when not PROSPECT) + Client Onboarding Date (disabled when PROSPECT) */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Follow-up date</span>
                            </label>
                            <DateTimePicker value={followUpDate} onChange={setFollowUpDateD} placeholder="Select date" disabled={isSandboxFirm} defaultTime="09:00" />
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When to setup a new reminder to follow up?</p>
                        </div>
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Lead conversion date</span>
                            </label>
                            <DateTimePicker value={expectedCloseDate} onChange={setExpectedCloseDateD} placeholder="Select date" disabled={isSandboxFirm || status !== 'PROSPECT'} defaultTime="17:00" />
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When do you expect to convert the lead?</p>
                        </div>
                        <div>
                            <label className={fieldLabel}>
                                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Client onboarding date</span>
                            </label>
                            <DateTimePicker value={clientSinceDate} onChange={setClientSinceDateD} placeholder="Select date" disabled={isSandboxFirm || status === 'PROSPECT'} defaultTime="00:00" />
                            <p className="mt-1 text-[10px] text-[#9a9ba0]">When did the formal business relationship start?</p>
                        </div>
                    </div>

                    {/* Row 3: Internal Memo */}
                    <div>
                        <label htmlFor="client-internal-memo" className={fieldLabel}>
                            <span className="inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" /> Internal memo
                                <span className="inline-flex items-center gap-0.5 normal-case tracking-normal font-sans text-[#9a9ba0]">— internal only</span>
                            </span>
                        </label>
                        <textarea id="client-internal-memo" value={internalMemo} onChange={(e) => setInternalMemoD(e.target.value)} placeholder="Private notes, call summaries, relationship context…" rows={2} disabled={isSandboxFirm} className={textareaCls} />
                    </div>
                </div>
            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-3">
                <Button type="button" variant="outline" className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => router.push(`/d/f/${orgSlug}/c/${clientSlug}?tab=projects`)}>
                    Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSandboxFirm || saving || !detailsDirty} variant="greenCta" className="rounded w-32 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>

                    </div>
                    </div>
                    </div>
            </section>

            {/* Document storage */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('drive')} className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#ffffff' }}>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Document storage</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'drive' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'drive' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                    <div className="p-4 bg-white border-t border-[#e5e7eb]">
                        <ClientDriveSection
                            connectorId={connectorId ?? null}
                            clientId={clientId ?? ''}
                            firmId={firmId ?? ''}
                            orgSlug={orgSlug}
                            isSandboxFirm={isSandboxFirm}
                        />
                    </div>
                    </div>
                    </div>
            </section>

            {/* Branding */}
            <section className="border border-[#e5e7eb] rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('branding')} className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:brightness-95" style={sectionHeaderStyle ?? { backgroundColor: '#ffffff' }}>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Branding</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${openSection === 'branding' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'branding' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                    <div className="p-4 bg-white border-t border-[#e5e7eb]">

                        {/* Branding source segmented control */}
                        <div className="flex items-center justify-center mb-5">
                            <div className="inline-flex items-center gap-0.5 bg-[#e4e4e8] border border-[#d1d1d6] rounded-full p-0.5">
                                <button
                                    type="button"
                                    onClick={() => { setUseCustomBranding(false); setBrandDirty(true) }}
                                    disabled={isSandboxFirm}
                                    className={`px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 ${
                                        !useCustomBranding
                                            ? 'bg-white text-[#1b1b1d] shadow-sm'
                                            : 'text-[#9a9ba0] hover:text-[#45474c]'
                                    }`}
                                >
                                    Inherit Firm Branding
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setUseCustomBranding(true); setBrandDirty(true) }}
                                    disabled={isSandboxFirm}
                                    className={`px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 ${
                                        useCustomBranding
                                            ? 'bg-white text-[#1b1b1d] shadow-sm'
                                            : 'text-[#9a9ba0] hover:text-[#45474c]'
                                    }`}
                                >
                                    Use Custom Branding
                                </button>
                            </div>
                        </div>

                        <div className={`grid grid-cols-[1fr_1fr] gap-4 transition-opacity duration-200 ${useCustomBranding ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            {/* Left: tagline + colors */}
                            <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                {/* Reset colors */}
                                <div className="flex items-center justify-between">
                                    <p className={fieldLabel}>Identity</p>
                                    {(brandPrimaryColor || brandSecondaryColor) && !isSandboxFirm && (
                                        <button type="button" onClick={() => { setBrandPrimaryColorD(''); setBrandSecondaryColorD('') }}
                                            className="inline-flex items-center gap-1 text-[10px] font-medium text-firma hover:text-firma/80 transition-colors"
                                            aria-label="Reset to Firma theme">
                                            <RotateCcw className="h-3 w-3" /> Reset colors
                                        </button>
                                    )}
                                </div>
                                {/* Display name */}
                                <div>
                                    <label htmlFor="brand-name" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Display name <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— shown in topbar</span></span>
                                    </label>
                                    <Input id="brand-name" value={brandName} onChange={(e) => setBrandNameD(e.target.value)} placeholder={name || 'Client name'} disabled={isSandboxFirm} className={inputCls} />
                                </div>
                                {/* Tagline */}
                                <div>
                                    <label htmlFor="brand-subtext" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><Type className="h-3 w-3" /> Brand tagline <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                    </label>
                                    <Input id="brand-subtext" value={brandSubtext} onChange={(e) => setBrandSubtextD(e.target.value)} placeholder="Optional tagline or subtext" disabled={isSandboxFirm} className={inputCls} />
                                </div>
                                {/* Primary color */}
                                <div className="space-y-1.5">
                                    <label htmlFor="brand-primary-color" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand primary color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input id="brand-primary-color" type="color" value={brandPrimaryColor || FIRMA_COLOR}
                                            onChange={(e) => setBrandPrimaryColorD(e.target.value)} disabled={isSandboxFirm}
                                            className="h-9 w-10 rounded border border-[#e5e7eb] cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60 shrink-0" />
                                        <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColorD(e.target.value)}
                                            placeholder={`Leave empty to use Firma default (${FIRMA_COLOR})`}
                                            disabled={isSandboxFirm} className={`font-mono ${inputCls}`} />
                                        <button type="button" onClick={() => setBrandPrimaryColorD('')} disabled={!brandPrimaryColor || isSandboxFirm}
                                            className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default" aria-label="Clear primary color">
                                            <RotateCcw className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    {brandPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryColor) && contrastRatioAgainstWhite(brandPrimaryColor) < 3 && (
                                        <p className="flex items-center gap-1 text-xs text-amber-600">
                                            <Info className="h-3 w-3 shrink-0" />
                                            Low contrast against white ({contrastRatioAgainstWhite(brandPrimaryColor)}:1).
                                        </p>
                                    )}
                                </div>
                                {/* Accent color */}
                                <div className="space-y-1.5">
                                    <label htmlFor="brand-accent-color" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Brand accent color <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                    </label>
                                    <p className="text-[11px] text-[#9a9ba0]">Used for nav stripe &amp; tab underlines. Leave empty to match primary.</p>
                                    <div className="flex items-center gap-2">
                                        <div className="relative h-9 w-10 shrink-0">
                                            <input id="brand-accent-color" type="color" value={brandSecondaryColor || '#ffffff'}
                                                onChange={(e) => setBrandSecondaryColorD(e.target.value)} disabled={isSandboxFirm}
                                                className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                            <div className="h-9 w-10 rounded border border-[#e5e7eb] pointer-events-none"
                                                style={brandSecondaryColor ? { backgroundColor: brandSecondaryColor } : { background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, white 2px, white 6px)' }} />
                                        </div>
                                        <Input value={brandSecondaryColor} onChange={(e) => setBrandSecondaryColorD(e.target.value)}
                                            placeholder="Leave empty to match primary color" disabled={isSandboxFirm} className={`font-mono ${inputCls}`} />
                                        <button type="button" onClick={() => setBrandSecondaryColorD('')} disabled={!brandSecondaryColor || isSandboxFirm}
                                            className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default" aria-label="Clear accent color">
                                            <RotateCcw className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right: logo + preview */}
                            <div className="bg-white rounded border border-[#e5e7eb] p-4 space-y-3">
                                <p className={fieldLabel}>Logo &amp; preview</p>
                                <div className="space-y-1.5">
                                    <label htmlFor="brand-logo" className={fieldLabel}>
                                        <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Logo <span className="text-[#9a9ba0] normal-case tracking-normal font-sans font-normal">— optional</span></span>
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                            const dims = { '1:1': [16, 16], '4:3': [21, 16], '16:9': [28, 16] }
                                            const [w, h] = dims[ar]
                                            const active = brandLogoAspectRatio === ar
                                            return (
                                                <button key={ar} type="button"
                                                    onClick={() => { setBrandLogoAspectRatioD(ar); setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0) }}
                                                    disabled={isSandboxFirm}
                                                    className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded border transition-colors disabled:opacity-50 ${active ? 'border-primary bg-primary/5 text-primary' : 'border-[#e5e7eb] text-[#9a9ba0] hover:border-[#45474c] hover:text-[#45474c]'}`}>
                                                    <span className={`block rounded-sm border-2 ${active ? 'border-primary' : 'border-current'}`} style={{ width: w, height: h }} />
                                                    <span className="text-[9px] font-mono font-bold tracking-wide leading-none">{ar}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="text-xs text-[#9a9ba0]">JPG, PNG or SVG. Max 5 MB.</p>
                                    <input ref={brandFileInputRef} id="brand-logo" type="file"
                                        accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                                        onChange={handleBrandLogoFileChange} className="sr-only" aria-hidden />
                                    <TooltipProvider delayDuration={300}>
                                        {!brandLoaded ? (
                                            <div className="flex shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]"
                                                style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }}>
                                                <svg className="animate-spin h-5 w-5 text-[#9a9ba0]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                            </div>
                                        ) : !(brandLogoPreviewUrl || brandLogoUrl) ? (
                                            <button type="button"
                                                onClick={() => brandFileInputRef.current?.click()}
                                                disabled={isSandboxFirm}
                                                className="relative flex shrink-0 items-center justify-center rounded border-2 border-dashed border-[#e5e7eb] bg-slate-50 hover:border-primary/40 transition-colors focus:outline-none group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-[#e5e7eb]"
                                                style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} aria-label="Upload logo">
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
                                                <div className={`relative flex shrink-0 rounded border border-[#e5e7eb] overflow-hidden select-none group ${!isSandboxFirm ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                                    style={{ width: brandPreviewW, height: BRAND_PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                                    {...(!isSandboxFirm ? { onPointerDown: onBrandPointerDown, onPointerMove: onBrandPointerMove, onPointerUp: onBrandPointerUp, onPointerLeave: onBrandPointerUp } : {})}>
                                                    <div className="absolute inset-0 flex items-center justify-center"
                                                        style={{ transform: `translate(${brandLogoX}px, ${brandLogoY}px) scale(${brandLogoScale})` }}>
                                                        <img src={brandLogoPreviewUrl || brandLogoUrl || undefined} alt="Logo preview"
                                                            className="max-w-full max-h-full object-contain pointer-events-none"
                                                            style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} draggable={false} />
                                                    </div>
                                                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button type="button" onClick={() => !isSandboxFirm && brandFileInputRef.current?.click()}
                                                                    disabled={isSandboxFirm} className="p-2 rounded bg-white text-[#1b1b1d] hover:bg-[#f9f9fb] shadow-sm disabled:opacity-50"><ImagePlus className="h-4 w-4" /></button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Replace</TooltipContent>
                                                        </Tooltip>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button type="button" onClick={() => void handleRemoveBrandLogo()} disabled={isSandboxFirm}
                                                                    className="p-2 rounded bg-white text-red-600 hover:bg-red-50 shadow-sm disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Remove</TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                                {(brandLogoPreviewUrl || brandLogoUrl) && (
                                                    <div className="flex flex-col gap-1" style={{ maxWidth: brandPreviewW, width: '100%' }}>
                                                        <input type="range" min={-1} max={1} step={0.04}
                                                            value={brandLogoScale <= 1 ? (brandLogoScale - 1) / 0.5 : (brandLogoScale - 1) / 2}
                                                            onChange={(e) => {
                                                                const v = Number(e.target.value)
                                                                setBrandLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2)
                                                                setBrandDirty(true)
                                                            }}
                                                            disabled={isSandboxFirm}
                                                            className="w-full h-1.5 rounded appearance-none bg-[#e5e7eb] accent-primary disabled:opacity-60" />
                                                        <div className="flex items-center justify-between px-0.5">
                                                            <button type="button" onClick={() => { setBrandLogoScale(Math.max(0.5, brandLogoScale - 0.1)); setBrandDirty(true) }} disabled={isSandboxFirm} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none disabled:opacity-50">−</button>
                                                            <button type="button" onClick={() => { setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0); setBrandDirty(true) }} disabled={isSandboxFirm || (brandLogoScale === 1 && brandLogoX === 0 && brandLogoY === 0)} className="text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-default"><RotateCcw className="h-3 w-3" /></button>
                                                            <button type="button" onClick={() => { setBrandLogoScale(Math.min(3, brandLogoScale + 0.1)); setBrandDirty(true) }} disabled={isSandboxFirm} className="text-[11px] font-mono text-[#9a9ba0] hover:text-[#1b1b1d] leading-none disabled:opacity-50">+</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </TooltipProvider>
                                </div>

                                {/* Header preview */}
                                <div className="mt-1">
                                    <p className={`${fieldLabel} mb-2`}>Header preview</p>
                                    <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3 flex items-center gap-3">
                                        {(brandLogoPreviewUrl || brandLogoUrl) ? (() => {
                                            const displayH = 40
                                            const displayW = Math.round(displayH * brandAspectMap[brandLogoAspectRatio])
                                            const scale = displayH / BRAND_PREVIEW_H
                                            return (
                                                <div className="relative shrink-0 rounded-lg bg-slate-50 border-2 border-slate-100 overflow-hidden"
                                                    style={{ width: displayW, height: displayH }}>
                                                    <div className="absolute inset-0 flex items-center justify-center"
                                                        style={{ transform: `translate(${brandLogoX * scale}px, ${brandLogoY * scale}px) scale(${brandLogoScale})`, transformOrigin: 'center' }}>
                                                        <img src={brandLogoPreviewUrl || brandLogoUrl || ''}
                                                            alt="Logo preview" className="object-contain pointer-events-none"
                                                            style={{ width: displayW, height: displayH }} draggable={false} />
                                                    </div>
                                                </div>
                                            )
                                        })() : (
                                            <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-50 border-2 border-slate-100 h-10 w-10 text-lg font-semibold"
                                                style={{ color: brandPrimaryColor || FIRMA_COLOR }}>
                                                {(name || '?').trim().charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                        <div className="flex flex-col justify-center min-w-0">
                                            <span className="font-headline text-xl font-bold tracking-tighter text-[#1b1b1d] truncate leading-tight">
                                                {brandName || name || 'Client name'}
                                            </span>
                                            {brandSubtext && <span className="text-[11px] text-gray-500 truncate mt-0.5">{brandSubtext}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Save branding */}
                        <div className="mt-4 flex items-center gap-3">
                            <Button onClick={() => void handleSaveBrand()} disabled={isSandboxFirm || savingBrand || !brandDirty} variant="greenCta"
                                className="rounded w-40 text-[10px] font-headline font-bold tracking-widest uppercase text-white">
                                {savingBrand ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                    </div>
                    </div>
            </section>

            {/* Danger zone — collapsible */}
            <section className="border border-red-200 rounded overflow-hidden">
                <button type="button" onClick={() => toggleSection('danger')} className="w-full px-4 py-3 flex items-center justify-between bg-red-50/60 hover:bg-red-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-red-700">Danger zone</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-red-500 transition-transform duration-200 ${openSection === 'danger' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openSection === 'danger' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden min-h-0">
                    <div className="p-4 border-t border-red-200 bg-red-50/40 space-y-3">
                        <p className="text-xs text-[#45474c]">Permanently delete this client. All engagements and members will be removed. This cannot be undone.</p>
                        <Button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={isSandboxFirm || deleting} className="rounded bg-red-700 text-white hover:bg-red-800 border-0 text-[10px] font-headline font-bold tracking-widest uppercase">
                            {deleting ? 'Deleting…' : 'Delete client'}
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
                title="Delete client"
                subtitle="This action cannot be undone."
                description="Permanently delete this client? All engagements and members will be removed. This cannot be undone."
                confirmLabel="Delete client"
                confirmVariant="red"
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={() => void performDeleteClient()}
                loading={deleting}
            />
        </div>
    )
}
