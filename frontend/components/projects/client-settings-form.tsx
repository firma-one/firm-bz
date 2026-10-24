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
import { ImageIcon, ImagePlus, Info, Lock, Linkedin, Palette, PanelTop, RotateCcw, Trash2, Type, Users2, MapPin, User, Activity, Building2, Globe, FileText, Share2, CalendarCheck, CalendarDays } from 'lucide-react'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { StatusProperty } from '@/components/ui/property-cells'
import { Textarea } from '@/components/ui/textarea'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { ClientDriveSection } from '@/components/connectors/client-drive-section'
import { contrastRatioAgainstWhite } from '@/lib/color-utils'
import { FIRMA_COLOR } from '@/config/brand'
import { clientTabPath, firmTabPath } from '@/lib/navigation/firm-paths'

const MAX_LOGO_SIZE = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']

export interface ClientSettingsFormProps {
    groupSlug: string
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
    onSaved?: () => void
}

const CLIENT_STATUSES: LwCrmClientStatus[] = ['PROSPECT', 'ACTIVE', 'ON_HOLD', 'PAST']

/** Hidden as on the firm's Branding tab (firm-settings-form.tsx): the New UI has one accent. */
const SHOW_ACCENT_COLOR = false

export function ClientSettingsForm({
    groupSlug,
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
    onSaved,
}: ClientSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
    const { user } = useAuth()
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
    // The follow-up date has no field for now but is still loaded and saved back, so a stored one
    // survives edits. KEEP: client follow-up dates are paused, not retired — hidden from the UI on 2026-10-17 and to be revived. Don't remove this as unused.
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
            // Agents excluded: a client owner is a person who is accountable for the
            // relationship, which is not something Brio can be.
            .then((res) => setMemberOptions(res.members
                .filter((m) => !(m as { isAgent?: boolean }).isAgent)
                .map((m) => ({ userId: m.userId, label: m.user?.name || m.user?.email || m.userId }))))
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
        if (!clientId) return
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
        setDeleting(true)
        try {
            await deleteClient(orgSlug, clientSlug)
            addToast({ type: 'success', title: 'Client deleted', message: 'Client has been removed.' })
            setDeleteConfirmOpen(false)
            onSaved?.()
            router.push(firmTabPath(groupSlug, orgSlug, 'clients'))
        } catch (e: unknown) {
            addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Could not delete client.' })
        } finally {
            setDeleting(false)
        }
    }

    const hasBrandLogo = Boolean(brandLogoPreviewUrl || brandLogoUrl)

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Details</h3>
                <PropertyList>
                    <PropertyRow label={<label htmlFor="client-name">Name</label>} icon={<User />}>
                        <Input id="client-name" value={name} onChange={(e) => setNameD(e.target.value)} placeholder="Client name" required className={PROPERTY_FIELD_CLASS} />
                    </PropertyRow>
                    <PropertyRow label="Status" icon={<Activity />}>
                        <StatusProperty kind="client" value={status} options={CLIENT_STATUSES} onChange={(v) => setStatusD(v as LwCrmClientStatus)} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-industry">Industry</label>} icon={<Building2 />}>
                        <Input id="client-industry" value={industry} onChange={(e) => setIndustryD(e.target.value)} placeholder="Empty" className={PROPERTY_FIELD_CLASS} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-company-size">Company size</label>} icon={<Users2 />}>
                        <SelectWithCustomEntry id="client-company-size" value={companySizeBracket} onChange={setCompanySizeBracketD} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Empty" customEntryHint="Custom…" className={PROPERTY_FIELD_CLASS} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-website">Website</label>} icon={<Globe />}>
                        <Input id="client-website" value={website} onChange={(e) => setWebsiteD(e.target.value)} placeholder="https://…" className={PROPERTY_FIELD_CLASS} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-linkedin">LinkedIn</label>} icon={<Linkedin />}>
                        <Input id="client-linkedin" value={linkedInUrl} onChange={(e) => setLinkedInUrlD(e.target.value)} placeholder="https://linkedin.com/company/…" className={PROPERTY_FIELD_CLASS} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-billing-address">Billing address</label>} icon={<MapPin />}>
                        <Textarea id="client-billing-address" value={billingAddress} onChange={(e) => setBillingAddressD(e.target.value)} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                    </PropertyRow>
                    <PropertyRow label={<label htmlFor="client-description">Notes</label>} icon={<FileText />}>
                        <Textarea id="client-description" value={description} onChange={(e) => setDescriptionD(e.target.value)} placeholder="Additional details about the client" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                    </PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Relationship</h3>
                <PropertyList>
                    <PropertyRow label={<label htmlFor="client-lead-source">Lead source</label>} icon={<Share2 />}>
                        <div className="flex w-full flex-col gap-1">
                            <SelectWithCustomEntry id="client-lead-source" value={leadSource} onChange={setLeadSourceD} options={['Referral', 'Inbound', 'Outbound', 'Conference', 'Existing Network']} placeholder="Empty" customEntryHint="Other…" className={PROPERTY_FIELD_CLASS} />
                            <p className={PROPERTY_HINT_CLASS}>How the lead came in</p>
                        </div>
                    </PropertyRow>
                    {/* A prospect has an expected close; a client has a start date. Both are kept on save. */}
                    {status === 'PROSPECT' ? (
                        <PropertyRow label="Expected close" icon={<CalendarCheck />}>
                            <div className="flex w-full flex-col gap-1">
                                <DateTimePicker value={expectedCloseDate} onChange={setExpectedCloseDateD} placeholder="Empty" defaultTime="17:00" className={PROPERTY_FIELD_CLASS} />
                                <p className={PROPERTY_HINT_CLASS}>When you expect to convert the lead</p>
                            </div>
                        </PropertyRow>
                    ) : (
                        <PropertyRow label="Client since" icon={<CalendarDays />}>
                            <div className="flex w-full flex-col gap-1">
                                <DateTimePicker value={clientSinceDate} onChange={setClientSinceDateD} placeholder="Empty" defaultTime="00:00" className={PROPERTY_FIELD_CLASS} />
                                <p className={PROPERTY_HINT_CLASS}>When the formal business relationship started</p>
                            </div>
                        </PropertyRow>
                    )}
                    <PropertyRow label={<label htmlFor="client-internal-memo">Internal memo</label>} icon={<Lock />}>
                        <div className="flex w-full flex-col gap-1">
                            <Textarea id="client-internal-memo" value={internalMemo} onChange={(e) => setInternalMemoD(e.target.value)} placeholder="Private notes, call summaries, relationship context…" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                            <p className={PROPERTY_HINT_CLASS}>Only your firm sees this.</p>
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={saving || !detailsDirty || !name.trim()} variant="greenCta">
                    {saving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push(clientTabPath(groupSlug, orgSlug, clientSlug, 'projects'))}>
                    Cancel
                </Button>
            </div>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Document storage</h3>
                <ClientDriveSection
                    connectorId={connectorId ?? null}
                    clientId={clientId ?? ''}
                    firmId={firmId ?? ''}
                    groupSlug={groupSlug}
                    orgSlug={orgSlug}
                />
            </section>

            <section>
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-line pb-2">
                    <h3 className="text-h3 text-fg">Branding</h3>
                    <div className="inline-flex items-center rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="Branding source">
                        {([false, true] as const).map((custom) => (
                            <button
                                key={String(custom)}
                                type="button"
                                aria-pressed={useCustomBranding === custom}
                                onClick={() => { setUseCustomBranding(custom); setBrandDirty(true) }}
                                className={`rounded-[4px] px-2.5 py-1 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30 ${useCustomBranding === custom ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
                            >
                                {custom ? 'Custom' : 'Firm branding'}
                            </button>
                        ))}
                    </div>
                </div>

                {!useCustomBranding ? (
                    <p className="py-2 text-small text-fg-muted">This client uses your firm&apos;s name, logo and colors. Switch to Custom to give it its own.</p>
                ) : (
                    <PropertyList>
                        <PropertyRow label={<label htmlFor="brand-name">Display name</label>} icon={<User />}>
                            <div className="flex w-full flex-col gap-1">
                                <Input id="brand-name" value={brandName} onChange={(e) => setBrandNameD(e.target.value)} placeholder={name || 'Client name'} className={PROPERTY_FIELD_CLASS} />
                                <p className={PROPERTY_HINT_CLASS}>Shown in the top bar</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="brand-subtext">Tagline</label>} icon={<Type />}>
                            <Input id="brand-subtext" value={brandSubtext} onChange={(e) => setBrandSubtextD(e.target.value)} placeholder="Empty" className={PROPERTY_FIELD_CLASS} />
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="brand-primary-color">{SHOW_ACCENT_COLOR ? 'Primary color' : 'Brand color'}</label>} icon={<Palette />}>
                            <div className="flex w-full flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <input id="brand-primary-color" type="color" value={brandPrimaryColor || FIRMA_COLOR}
                                        onChange={(e) => setBrandPrimaryColorD(e.target.value)}
                                        className="h-7 w-8 shrink-0 cursor-pointer rounded-control border border-line bg-surface" />
                                    <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColorD(e.target.value)} aria-label="Brand color hex"
                                        placeholder={`Empty — uses the Firma default (${FIRMA_COLOR})`} className={`font-mono ${PROPERTY_FIELD_CLASS}`} />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setBrandPrimaryColorD('')} disabled={!brandPrimaryColor} title="Clear" aria-label="Clear brand color">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                {brandPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryColor) && contrastRatioAgainstWhite(brandPrimaryColor) < 3 && (
                                    <p className="flex items-center gap-1 px-2 text-caption text-tag-orange-fg">
                                        <Info className="h-3 w-3 shrink-0" />
                                        Low contrast against white ({contrastRatioAgainstWhite(brandPrimaryColor)}:1).
                                    </p>
                                )}
                                <p className={PROPERTY_HINT_CLASS}>Buttons, links and selected states on this client&apos;s pages. A light color is darkened to stay readable.</p>
                            </div>
                        </PropertyRow>
                        {SHOW_ACCENT_COLOR && (
                        <PropertyRow label={<label htmlFor="brand-accent-color">Accent color</label>} icon={<Palette />}>
                            <div className="flex w-full flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="relative h-7 w-8 shrink-0">
                                        <input id="brand-accent-color" type="color" value={brandSecondaryColor || '#ffffff'}
                                            onChange={(e) => setBrandSecondaryColorD(e.target.value)}
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                                        <div className="pointer-events-none h-7 w-8 rounded-control border border-line"
                                            style={brandSecondaryColor ? { backgroundColor: brandSecondaryColor } : { background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, white 2px, white 6px)' }} />
                                    </div>
                                    <Input value={brandSecondaryColor} onChange={(e) => setBrandSecondaryColorD(e.target.value)} aria-label="Accent color hex"
                                        placeholder="Empty — matches the primary color" className={`font-mono ${PROPERTY_FIELD_CLASS}`} />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setBrandSecondaryColorD('')} disabled={!brandSecondaryColor} title="Clear" aria-label="Clear accent color">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <p className={PROPERTY_HINT_CLASS}>Nav stripe and tab underlines</p>
                            </div>
                        </PropertyRow>
                        )}
                        <PropertyRow label={<label htmlFor="brand-logo">Logo</label>} icon={<ImageIcon />}>
                            <div className="flex w-full flex-col gap-2 px-2 py-1">
                                <div className="flex items-center gap-1.5" role="group" aria-label="Logo shape">
                                    {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                        const dims = { '1:1': [16, 16], '4:3': [21, 16], '16:9': [28, 16] }
                                        const [w, h] = dims[ar]
                                        const active = brandLogoAspectRatio === ar
                                        return (
                                            <button key={ar} type="button" aria-pressed={active}
                                                onClick={() => { setBrandLogoAspectRatioD(ar); setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0) }}
                                                className={`flex flex-col items-center gap-1 rounded-control border px-2 py-1.5 transition-colors ${active ? 'border-action bg-action/5 text-action' : 'border-line text-fg-subtle hover:border-line-strong hover:text-fg-muted'}`}>
                                                <span className="block rounded-sm border-2 border-current" style={{ width: w, height: h }} />
                                                <span className="text-caption leading-none tabular-nums">{ar}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <input ref={brandFileInputRef} id="brand-logo" type="file"
                                    accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                                    onChange={handleBrandLogoFileChange} className="sr-only" aria-hidden />
                                <TooltipProvider delayDuration={300}>
                                    {!brandLoaded ? (
                                        <div className="flex shrink-0 items-center justify-center rounded-card border border-line bg-surface-subtle"
                                            style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }}>
                                            <LoadingSpinner size="sm" />
                                        </div>
                                    ) : !hasBrandLogo ? (
                                        <button type="button"
                                            onClick={() => brandFileInputRef.current?.click()}
                                            className="group relative flex shrink-0 items-center justify-center rounded-card border-2 border-dashed border-line-strong bg-surface-subtle transition-colors hover:border-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                                            style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} aria-label="Upload logo">
                                            <span className="select-none text-5xl font-semibold text-line-strong transition-opacity group-hover:opacity-30">
                                                {name.trim().charAt(0).toUpperCase() || '?'}
                                            </span>
                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                <ImagePlus className="h-5 w-5 text-fg-muted" />
                                                <span className="text-small text-fg-muted">Upload logo</span>
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <div className="group relative flex shrink-0 cursor-grab select-none overflow-hidden rounded-card border border-line active:cursor-grabbing"
                                                style={{ width: brandPreviewW, height: BRAND_PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                                onPointerDown={onBrandPointerDown} onPointerMove={onBrandPointerMove} onPointerUp={onBrandPointerUp} onPointerLeave={onBrandPointerUp}>
                                                <div className="absolute inset-0 flex items-center justify-center"
                                                    style={{ transform: `translate(${brandLogoX}px, ${brandLogoY}px) scale(${brandLogoScale})` }}>
                                                    <img src={brandLogoPreviewUrl || brandLogoUrl || undefined} alt="Logo preview"
                                                        className="pointer-events-none max-h-full max-w-full object-contain"
                                                        style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} draggable={false} />
                                                </div>
                                                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button type="button" onClick={() => brandFileInputRef.current?.click()} className="rounded-control bg-surface p-2 text-fg shadow-popover hover:bg-surface-hover" aria-label="Replace logo"><ImagePlus className="h-4 w-4" /></button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Replace</TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button type="button" onClick={() => void handleRemoveBrandLogo()} className="rounded-control bg-surface p-2 text-danger shadow-popover hover:bg-surface-hover" aria-label="Remove logo"><Trash2 className="h-4 w-4" /></button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Remove</TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1" style={{ maxWidth: brandPreviewW, width: '100%' }}>
                                                <input type="range" min={-1} max={1} step={0.04} aria-label="Logo zoom"
                                                    value={brandLogoScale <= 1 ? (brandLogoScale - 1) / 0.5 : (brandLogoScale - 1) / 2}
                                                    onChange={(e) => {
                                                        const v = Number(e.target.value)
                                                        setBrandLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2)
                                                        setBrandDirty(true)
                                                    }}
                                                    className="h-1.5 w-full appearance-none rounded bg-surface-muted accent-action" />
                                                <div className="flex items-center justify-between px-0.5">
                                                    <button type="button" onClick={() => { setBrandLogoScale(Math.max(0.5, brandLogoScale - 0.1)); setBrandDirty(true) }} className="font-mono text-small leading-none text-fg-subtle hover:text-fg" aria-label="Zoom out">−</button>
                                                    <button type="button" onClick={() => { setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0); setBrandDirty(true) }} disabled={brandLogoScale === 1 && brandLogoX === 0 && brandLogoY === 0} className="text-fg-subtle transition-colors hover:text-fg-muted disabled:cursor-default disabled:opacity-30" aria-label="Reset zoom and position"><RotateCcw className="h-3 w-3" /></button>
                                                    <button type="button" onClick={() => { setBrandLogoScale(Math.min(3, brandLogoScale + 0.1)); setBrandDirty(true) }} className="font-mono text-small leading-none text-fg-subtle hover:text-fg" aria-label="Zoom in">+</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </TooltipProvider>
                                <p className="text-caption text-fg-subtle">JPG, PNG or SVG. Max 5 MB.</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label="Preview" icon={<PanelTop />}>
                            <div className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
                                {hasBrandLogo ? (() => {
                                    const displayH = 40
                                    const displayW = Math.round(displayH * brandAspectMap[brandLogoAspectRatio])
                                    const scale = displayH / BRAND_PREVIEW_H
                                    return (
                                        <div className="relative shrink-0 overflow-hidden rounded-control border border-line bg-surface-subtle"
                                            style={{ width: displayW, height: displayH }}>
                                            <div className="absolute inset-0 flex items-center justify-center"
                                                style={{ transform: `translate(${brandLogoX * scale}px, ${brandLogoY * scale}px) scale(${brandLogoScale})`, transformOrigin: 'center' }}>
                                                <img src={brandLogoPreviewUrl || brandLogoUrl || ''}
                                                    alt="" className="pointer-events-none object-contain"
                                                    style={{ width: displayW, height: displayH }} draggable={false} />
                                            </div>
                                        </div>
                                    )
                                })() : (
                                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-subtle text-h3 font-semibold"
                                        style={{ color: brandPrimaryColor || FIRMA_COLOR }}>
                                        {(name || '?').trim().charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="flex min-w-0 flex-col justify-center">
                                    <span className="truncate text-h3 font-semibold leading-tight text-fg">{brandName || name || 'Client name'}</span>
                                    {brandSubtext && <span className="mt-0.5 truncate text-small text-fg-muted">{brandSubtext}</span>}
                                </div>
                            </div>
                        </PropertyRow>
                    </PropertyList>
                )}

                <div className="mt-4 flex items-center gap-2">
                    <Button onClick={() => void handleSaveBrand()} disabled={savingBrand || !brandDirty} variant="greenCta">
                        {savingBrand ? 'Saving…' : 'Save branding'}
                    </Button>
                    {/* With one color, the row's own reset does this. */}
                    {SHOW_ACCENT_COLOR && useCustomBranding && (brandPrimaryColor || brandSecondaryColor) && (
                        <Button type="button" variant="ghost" onClick={() => { setBrandPrimaryColorD(''); setBrandSecondaryColorD('') }}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset colors
                        </Button>
                    )}
                </div>
            </section>

            {/* Linear-style destructive row: say what happens, one button — no colored box. */}
            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Danger zone</h3>
                <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <p className="text-ui font-medium text-fg">Delete client</p>
                        <p className="text-small text-fg-muted">
                            Permanently deletes this client. All engagements and members are removed. This cannot be undone.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={deleting}
                        className="shrink-0 text-danger hover:text-danger"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting ? 'Deleting…' : 'Delete client'}
                    </Button>
                </div>
            </section>

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                iconVariant="red"
                title="Delete client"
                subtitle="This action cannot be undone."
                description="All of this client's engagements and members will be removed."
                confirmLabel="Delete client"
                confirmVariant="red"
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={() => void performDeleteClient()}
                loading={deleting}
            />
        </div>
    )
}
