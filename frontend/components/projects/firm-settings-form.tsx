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
import { AtSign, BarChart2, Bell, Building2, CalendarClock, ChevronDown, Check, DollarSign, Factory, FileText, FlaskConical, Globe, ImageIcon, ImagePlus, Linkedin, Lock, MapPin, MessagesSquare, Palette, PanelTop, RefreshCw, Repeat, RotateCcw, Shield, Trash2, Type, User, Users2, X } from 'lucide-react'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { NotionTable, NotionTableBody, NotionTableCell, NotionTableHead, NotionTableHeader, NotionTableRow } from '@/components/ui/notion-table'
import { Textarea } from '@/components/ui/textarea'
import { Tag } from '@/components/ui/tag'
import { ShimmerBar } from '@/components/ui/shimmer'
import { TAG_DOT_CLASSES } from '@/lib/ui/status-colors'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectWithCustomEntry } from '@/components/ui/select-with-custom-entry'
import { FirmDriveSection } from '@/components/connectors/firm-drive-section'

function normaliseUrl(raw: string): string {
    const v = raw.trim()
    if (!v) return ''
    if (/^https?:\/\//i.test(v)) return v
    return `https://${v}`
}

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


const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
    'live.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com', 'zoho.com',
])

type EventNotificationChannels = { email: boolean; inApp: boolean }
type EventKey = 'newDocumentIntake' | 'statusChanged' | 'documentRejected' | 'externalClientComment' | 'engagementInviteAccepted' | 'deliverableOverdue' | 'reminders'
type EventNotificationConfig = Record<EventKey, EventNotificationChannels>

const EVENT_NOTIFICATION_DEFAULTS: EventNotificationConfig = {
    newDocumentIntake: { email: true, inApp: true },
    statusChanged: { email: false, inApp: true },
    documentRejected: { email: true, inApp: true },
    externalClientComment: { email: true, inApp: true },
    engagementInviteAccepted: { email: false, inApp: true },
    deliverableOverdue: { email: true, inApp: true },
    reminders: { email: true, inApp: true },
}

const EVENT_NOTIFICATION_ROWS: { key: EventKey; label: string }[] = [
    { key: 'newDocumentIntake', label: 'New document intake' },
    { key: 'statusChanged', label: 'Status changed (doc/deliverable)' },
    { key: 'documentRejected', label: 'Document rejected' },
    { key: 'externalClientComment', label: 'Client comment posted' },
    { key: 'engagementInviteAccepted', label: 'Engagement invite accepted' },
    { key: 'deliverableOverdue', label: 'Deliverable overdue' },
    { key: 'reminders', label: 'Reminders due (in-app also enables push)' },
]

/** Linear-style toggle row: what it does on the left, the switch on the right. */
function SettingSwitchRow({
    id,
    icon,
    title,
    description,
    checked,
    onChange,
    disabled,
}: {
    id?: string
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    checked: boolean
    onChange: (next: boolean) => void
    disabled?: boolean
}) {
    const autoId = React.useId()
    const switchId = id ?? autoId
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
                {icon && <span className="mt-0.5 flex shrink-0 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
                <label htmlFor={switchId} className="min-w-0 cursor-pointer">
                    <span className="block text-ui text-fg">{title}</span>
                    {description && <span className="mt-0.5 block text-small text-fg-muted">{description}</span>}
                </label>
            </div>
            <Switch id={switchId} checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </div>
    )
}

export interface FirmSettingsFormProps {
    orgSlug: string
    orgId?: string | null
    initialName: string
    /** Server-gated via Firm.settings.betaFeatures.microsoftStorageConnector, fails closed if omitted. */
    microsoftConnectorEnabled?: boolean
    initialSection?: Section
    onSaved?: () => void
}

type Section = 'main' | 'branding' | 'appsettings' | 'storage' | 'danger'

export function FirmSettingsForm({
    orgSlug,
    orgId: orgIdProp,
    initialName,
    microsoftConnectorEnabled = false,
    initialSection,
    onSaved,
}: FirmSettingsFormProps) {
    const router = useRouter()
    const { addToast } = useToast()
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
    const [betaDossier, setBetaDossier] = useState(false)
    const [betaMicrosoftStorageConnector, setBetaMicrosoftStorageConnector] = useState(false)
    const [immediateOnCreate, setImmediateOnCreate] = useState(true)
    const [recurringEnabled, setRecurringEnabled] = useState(true)
    const [recurringFrequencyDays, setRecurringFrequencyDays] = useState(1)
    const [startDaysBeforeDue, setStartDaysBeforeDue] = useState(7)
    const [mentionEmailOnCreate, setMentionEmailOnCreate] = useState(true)
    const [eventConfig, setEventConfig] = useState<EventNotificationConfig>(EVENT_NOTIFICATION_DEFAULTS)
    const [allowDomainAccess, setAllowDomainAccess] = useState(false)
    const [allowedEmailDomain, setAllowedEmailDomain] = useState('')
    // Which sections external members (Contributor / Reviewer) can see on Overview
    const [extEngagementHealth, setExtEngagementHealth] = useState(true)
    const [extFileOrganization, setExtFileOrganization] = useState(false)
    const [extDocumentActivity, setExtDocumentActivity] = useState(false)
    const [saving, setSaving] = useState(false)
    const [mainDirty, setMainDirty] = useState(false)
    const [appDirty, setAppDirty] = useState(false)
    const [savingBrand, setSavingBrand] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Deep link to the danger zone (?section=danger): it sits at the bottom of General.
    const dangerRef = useRef<HTMLElement>(null)
    useEffect(() => {
        if (initialSection === 'danger') dangerRef.current?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
                    const bf = (settings.betaFeatures as Record<string, boolean>) ?? {}
                    setBetaDossier(bf.dossier === true)
                    setBetaMicrosoftStorageConnector(bf.microsoftStorageConnector === true)
                    const rc = (settings.reminderEmailConfig as Record<string, any>) ?? {}
                    setImmediateOnCreate(rc.immediateOnCreate ?? true)
                    setRecurringEnabled(rc.recurring?.enabled ?? true)
                    setRecurringFrequencyDays(rc.recurring?.frequencyDays ?? 1)
                    setStartDaysBeforeDue(rc.recurring?.startDaysBeforeDue ?? 7)
                    setMentionEmailOnCreate(rc.mentionEmailOnCreate ?? true)
                    const rawEvents = (rc.events as Record<string, Partial<EventNotificationChannels>>) ?? {}
                    const nextEventConfig = {} as EventNotificationConfig
                    for (const key of Object.keys(EVENT_NOTIFICATION_DEFAULTS) as EventKey[]) {
                        const defaults = EVENT_NOTIFICATION_DEFAULTS[key]
                        const rawEvent = rawEvents[key] ?? {}
                        nextEventConfig[key] = {
                            email: rawEvent.email ?? defaults.email,
                            inApp: rawEvent.inApp ?? defaults.inApp,
                        }
                    }
                    setEventConfig(nextEventConfig)
                    const es = (settings.externalSections as Record<string, boolean>) ?? {}
                    setExtEngagementHealth(es.engagementHealth ?? true)
                    setExtFileOrganization(es.fileOrganization ?? false)
                    setExtDocumentActivity(es.documentActivity ?? false)
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
                betaFeatures: { dossier: betaDossier, microsoftStorageConnector: betaMicrosoftStorageConnector },
                internalMemo: internalMemo.trim() || null,
                industry: industry.trim() || null,
                companySizeBracket: companySizeBracket || null,
                companyWebsite: normaliseUrl(companyWebsite) || null,
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
                    mentionEmailOnCreate,
                    events: eventConfig,
                },
                externalSections: {
                    engagementHealth: extEngagementHealth,
                    fileOrganization: extFileOrganization,
                    documentActivity: extDocumentActivity,
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

    const mainSave = (
        <div className="flex items-center gap-2">
            <Button type="button" variant="greenCta" onClick={() => void handleSave()}
                disabled={saving || !loaded || !mainDirty || !name.trim()}>
                {saving ? 'Saving…' : 'Save changes'}
            </Button>
        </div>
    )

    const appSave = (
        <div className="flex items-center gap-2">
            <Button type="button" variant="greenCta" onClick={() => void handleSave({ skipNavigation: true })}
                disabled={saving || !loaded || (!appDirty && !mainDirty)}>
                {saving ? 'Saving…' : 'Save changes'}
            </Button>
        </div>
    )

    const hasBrandLogo = Boolean(brandLogoPreviewUrl || brandLogoUrl)
    // The danger zone lives at the bottom of General; its deep link opens General and scrolls there.
    const activeTab: Exclude<Section, 'danger'> = openSection === 'danger' ? 'main' : openSection
    const tabs: { value: Exclude<Section, 'danger'>; label: string; dirty?: boolean }[] = [
        { value: 'main', label: 'General', dirty: mainDirty },
        { value: 'branding', label: 'Branding', dirty: brandDirty },
        { value: 'appsettings', label: 'App settings', dirty: appDirty },
        { value: 'storage', label: 'Storage' },
    ]

    return (
        <div className="flex flex-col">
            <div className="mb-6 flex items-end gap-1 border-b border-line" role="tablist" aria-label="Settings sections">
                {tabs.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t.value}
                        onClick={() => setOpenSection(t.value)}
                        className={`relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2 text-ui transition-colors ${
                            activeTab === t.value ? 'border-fg text-fg' : 'border-transparent text-fg-muted hover:text-fg'
                        }`}
                    >
                        {t.label}
                        {t.dirty && <span className={`h-1.5 w-1.5 rounded-full ${TAG_DOT_CLASSES.yellow}`} title="Unsaved changes" />}
                    </button>
                ))}
            </div>

            {activeTab === 'main' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" role="tabpanel">
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Details</h3>
                        <PropertyList>
                            <PropertyRow label={<label htmlFor="org-name">Firm name</label>} icon={<Building2 />}>
                                <Input id="org-name" value={name} onChange={(e) => { setName(e.target.value); setMainDirty(true) }} placeholder="Firm name" required className={PROPERTY_FIELD_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-industry">Industry</label>} icon={<Factory />}>
                                <Input id="firm-industry" value={industry} onChange={(e) => { setIndustry(e.target.value); setMainDirty(true) }} placeholder="Empty" className={PROPERTY_FIELD_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-company-size">Company size</label>} icon={<Users2 />}>
                                <SelectWithCustomEntry id="firm-company-size" value={companySizeBracket} onChange={(v) => { setCompanySizeBracket(v); setMainDirty(true) }} options={['<10', '11–50', '51–200', '201–1000', '1000+']} placeholder="Empty" customEntryHint="Custom…" className={PROPERTY_FIELD_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-company-website">Website</label>} icon={<Globe />}>
                                <Input id="firm-company-website" type="text" value={companyWebsite} onChange={(e) => { setCompanyWebsite(e.target.value); setMainDirty(true) }} placeholder="https://example.com" className={PROPERTY_FIELD_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-linkedin">LinkedIn</label>} icon={<Linkedin />}>
                                <Input id="firm-linkedin" value={linkedInUrl} onChange={(e) => { setLinkedInUrl(e.target.value); setMainDirty(true) }} placeholder="https://linkedin.com/company/…" className={PROPERTY_FIELD_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-billing-address">Billing address</label>} icon={<MapPin />}>
                                <Textarea id="firm-billing-address" value={billingAddress} onChange={(e) => { setBillingAddress(e.target.value); setMainDirty(true) }} placeholder={"123 Main St\nCity, State ZIP\nCountry"} rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="firm-notes">Notes</label>} icon={<FileText />}>
                                <Textarea id="firm-notes" value={notes} onChange={(e) => { setNotes(e.target.value); setMainDirty(true) }} placeholder="Additional details about the firm" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                            </PropertyRow>
                            <PropertyRow label={<label htmlFor="org-internal-memo">Internal memo</label>} icon={<Lock />}>
                                <div className="flex w-full flex-col gap-1">
                                    <Textarea id="org-internal-memo" value={internalMemo} onChange={(e) => { setInternalMemo(e.target.value); setMainDirty(true) }} placeholder="Private notes, context about this firm…" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                                    <p className={PROPERTY_HINT_CLASS}>Only firm admins see this.</p>
                                </div>
                            </PropertyRow>
                        </PropertyList>
                    </section>

                    {mainSave}

                    {/* Linear-style destructive row: say what happens, one button — no colored box. */}
                    <section id="firm-danger-zone" ref={dangerRef} className="scroll-mt-4">
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Danger zone</h3>
                        <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <div className="min-w-0">
                                <p className="text-ui font-medium text-fg">Delete firm</p>
                                <p className="text-small text-fg-muted">
                                    Permanently deletes this firm. All clients, engagements and members are removed. This cannot be undone.
                                </p>
                            </div>
                            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting} className="shrink-0 text-danger hover:text-danger">
                                <Trash2 className="h-3.5 w-3.5" />
                                {deleting ? 'Deleting…' : 'Delete firm'}
                            </Button>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'branding' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" role="tabpanel">
                    <PropertyList>
                        <PropertyRow label={<label htmlFor="firm-brand-name">Display name</label>} icon={<User />}>
                            <div className="flex w-full flex-col gap-1">
                                <Input id="firm-brand-name" value={brandName} onChange={(e) => { setBrandName(e.target.value); setBrandDirty(true) }} placeholder={name || 'Firm name'} className={PROPERTY_FIELD_CLASS} />
                                <p className={PROPERTY_HINT_CLASS}>Shown in the top bar</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="firm-brand-subtext">Tagline</label>} icon={<Type />}>
                            <Input id="firm-brand-subtext" value={brandSubtext} onChange={(e) => { setBrandSubtext(e.target.value); setBrandDirty(true) }} placeholder="Empty" className={PROPERTY_FIELD_CLASS} />
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="firm-brand-primary">Primary color</label>} icon={<Palette />}>
                            <div className="flex w-full items-center gap-1.5">
                                <input id="firm-brand-primary" type="color" value={brandPrimaryColor || FIRMA_COLOR} onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true) }} className="h-7 w-8 shrink-0 cursor-pointer rounded-control border border-line bg-surface" />
                                <Input value={brandPrimaryColor} onChange={(e) => { setBrandPrimaryColor(e.target.value); setBrandDirty(true) }} aria-label="Primary color hex" placeholder={`Empty — uses the Firma default (${FIRMA_COLOR})`} className={`font-mono ${PROPERTY_FIELD_CLASS}`} />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setBrandPrimaryColor(''); setBrandDirty(true) }} disabled={!brandPrimaryColor} title="Clear" aria-label="Clear primary color">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </PropertyRow>
                        <PropertyRow label={<label htmlFor="firm-brand-accent">Accent color</label>} icon={<Palette />}>
                            <div className="flex w-full flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="relative h-7 w-8 shrink-0">
                                        <input id="firm-brand-accent" type="color" value={brandSecondaryColor || '#ffffff'} onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true) }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                                        <div className="pointer-events-none h-7 w-8 rounded-control border border-line" style={brandSecondaryColor ? { backgroundColor: brandSecondaryColor } : { background: 'repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 2px, white 2px, white 6px)' }} />
                                    </div>
                                    <Input value={brandSecondaryColor} onChange={(e) => { setBrandSecondaryColor(e.target.value); setBrandDirty(true) }} aria-label="Accent color hex" placeholder="Empty — matches the primary color" className={`font-mono ${PROPERTY_FIELD_CLASS}`} />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setBrandSecondaryColor(''); setBrandDirty(true) }} disabled={!brandSecondaryColor} title="Clear" aria-label="Clear accent color">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <p className={PROPERTY_HINT_CLASS}>Nav stripe and tab underlines</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label="Logo" icon={<ImageIcon />}>
                            <div className="flex w-full flex-col gap-2 px-2 py-1">
                                <div className="flex items-center gap-1.5" role="group" aria-label="Logo shape">
                                    {(['1:1', '4:3', '16:9'] as const).map((ar) => {
                                        const dims: Record<string, [number, number]> = { '1:1': [16, 16], '4:3': [21, 16], '16:9': [28, 16] }
                                        const [w, h] = dims[ar]; const active = brandLogoAspectRatio === ar
                                        return (
                                            <button key={ar} type="button" aria-pressed={active} onClick={() => { setBrandLogoAspectRatio(ar); setBrandLogoScale(1); setBrandLogoX(0); setBrandLogoY(0); setBrandDirty(true) }}
                                                className={`flex flex-col items-center gap-1 rounded-control border px-2 py-1.5 transition-colors ${active ? 'border-action bg-action/5 text-action' : 'border-line text-fg-subtle hover:border-line-strong hover:text-fg-muted'}`}>
                                                <span className="block rounded-sm border-2 border-current" style={{ width: w, height: h }} />
                                                <span className="text-caption leading-none tabular-nums">{ar}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <input ref={brandFileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml" onChange={handleBrandLogoFileChange} className="sr-only" aria-hidden />
                                {!hasBrandLogo ? (
                                    <button type="button" onClick={() => brandFileInputRef.current?.click()}
                                        className="group relative flex shrink-0 items-center justify-center rounded-card border-2 border-dashed border-line-strong bg-surface-subtle transition-colors hover:border-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                                        style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} aria-label="Upload logo">
                                        <span className="select-none text-5xl font-semibold text-line-strong transition-opacity group-hover:opacity-30">{(brandName || name).trim().charAt(0).toUpperCase() || '?'}</span>
                                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                            <ImagePlus className="h-5 w-5 text-fg-muted" /><span className="text-small text-fg-muted">Upload logo</span>
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="group relative flex shrink-0 cursor-grab select-none overflow-hidden rounded-card border border-line active:cursor-grabbing"
                                            style={{ width: brandPreviewW, height: BRAND_PREVIEW_H, backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)', backgroundSize: '12px 12px' }}
                                            onPointerDown={onBrandPointerDown} onPointerMove={onBrandPointerMove} onPointerUp={onBrandPointerUp} onPointerLeave={onBrandPointerUp}>
                                            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${brandLogoX}px, ${brandLogoY}px) scale(${brandLogoScale})` }}>
                                                <img src={brandLogoPreviewUrl || brandLogoUrl || undefined} alt="Logo" className="pointer-events-none max-h-full max-w-full object-contain" style={{ width: brandPreviewW, height: BRAND_PREVIEW_H }} draggable={false} />
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                                <button type="button" onClick={() => brandFileInputRef.current?.click()} className="rounded-control bg-surface p-2 text-fg shadow-popover hover:bg-surface-hover" title="Replace" aria-label="Replace logo"><ImagePlus className="h-4 w-4" /></button>
                                                <button type="button" onClick={() => { setBrandLogoUrl(''); setBrandLogoFile(null); setBrandLogoPreviewUrl(null); setBrandDirty(true) }} className="rounded-control bg-surface p-2 text-danger shadow-popover hover:bg-surface-hover" title="Remove" aria-label="Remove logo"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </div>
                                        <input type="range" min={-1} max={1} step={0.04} aria-label="Logo zoom"
                                            value={brandLogoScale <= 1 ? (brandLogoScale - 1) / 0.5 : (brandLogoScale - 1) / 2}
                                            onChange={(e) => { const v = Number(e.target.value); setBrandLogoScale(v <= 0 ? 1 + v * 0.5 : 1 + v * 2); setBrandDirty(true) }} className="h-1.5 w-full appearance-none rounded bg-surface-muted accent-action" style={{ maxWidth: brandPreviewW }} />
                                    </div>
                                )}
                                <p className="text-caption text-fg-subtle">JPG, PNG or SVG. Max 5 MB.</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label="Preview" icon={<PanelTop />}>
                            <div className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
                                {hasBrandLogo ? (() => {
                                    const dH = 40; const dW = Math.round(dH * brandAspectMap[brandLogoAspectRatio]); const sc = dH / BRAND_PREVIEW_H
                                    return (
                                        <div className="relative shrink-0 overflow-hidden rounded-control border border-line bg-surface-subtle" style={{ width: dW, height: dH }}>
                                            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${brandLogoX * sc}px, ${brandLogoY * sc}px) scale(${brandLogoScale})`, transformOrigin: 'center' }}>
                                                <img src={brandLogoPreviewUrl || brandLogoUrl || ''} alt="" className="pointer-events-none object-contain" style={{ width: dW, height: dH }} draggable={false} />
                                            </div>
                                        </div>
                                    )
                                })() : (
                                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-subtle text-h3 font-semibold" style={{ color: brandPrimaryColor || FIRMA_COLOR }}>
                                        {(brandName || name || '?').trim().charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="flex min-w-0 flex-col justify-center">
                                    <span className="truncate text-h3 font-semibold leading-tight text-fg">{brandName || name || 'Firm name'}</span>
                                    {brandSubtext && <span className="mt-0.5 truncate text-small text-fg-muted">{brandSubtext}</span>}
                                </div>
                            </div>
                        </PropertyRow>
                    </PropertyList>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => void handleSaveBrand()} disabled={savingBrand || !brandDirty} variant="greenCta">
                            {savingBrand ? 'Saving…' : 'Save branding'}
                        </Button>
                        {(brandPrimaryColor || brandSecondaryColor) && (
                            <Button type="button" variant="ghost" onClick={() => { setBrandPrimaryColor(''); setBrandSecondaryColor(''); setBrandDirty(true) }}>
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset colors
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'appsettings' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" role="tabpanel">
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Access</h3>
                        <SettingSwitchRow
                            id="allow-domain"
                            icon={<Shield />}
                            title={<>Let anyone at <span className="font-medium">{allowedEmailDomain || 'your domain'}</span> join</>}
                            description="People with this email domain can join without an invitation."
                            checked={allowDomainAccess}
                            onChange={(v) => { setAllowDomainAccess(v); setAppDirty(true) }}
                            disabled={!loaded}
                        />
                        {allowDomainAccess && (
                            <PropertyList className="mt-1">
                                <PropertyRow label={<label htmlFor="allowed-email-domain">Email domain</label>} icon={<AtSign />}>
                                    <div className="flex w-full flex-col gap-1">
                                        <Input id="allowed-email-domain" value={allowedEmailDomain} onChange={(e) => { setAllowedEmailDomain(e.target.value); setAppDirty(true) }} placeholder="e.g. acme.com" className={`font-mono ${PROPERTY_FIELD_CLASS}`} />
                                        {isPublicDomain && <p className="px-2 text-caption text-tag-orange-fg">Public email domains (e.g. gmail.com) aren&apos;t recommended for firm access.</p>}
                                    </div>
                                </PropertyRow>
                            </PropertyList>
                        )}
                    </section>

                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Regional</h3>
                        <PropertyList>
                            <PropertyRow label="Currency" icon={<DollarSign />}>
                                <div className="flex w-full flex-col gap-1">
                                    <div className="relative w-full">
                                        <DropdownMenu open={currencyOpen} onOpenChange={setCurrencyOpen}>
                                            <DropdownMenuTrigger asChild>
                                                <button type="button" disabled={!loaded} className="flex h-8 w-full items-center rounded-control px-2 pr-7 text-left text-ui transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:cursor-not-allowed disabled:opacity-60">
                                                    <span className={`flex-1 truncate ${currencyCode || (currencyIsCustom && currencyCustom) ? 'text-fg' : 'text-fg-subtle'}`}>
                                                        {currencyCode ? WORLD_CURRENCIES.find((c) => c.code === currencyCode)?.label ?? currencyCode : currencyIsCustom && currencyCustom ? `Other: ${currencyCustom}` : 'Empty'}
                                                    </span>
                                                </button>
                                            </DropdownMenuTrigger>
                                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                                                {(currencyCode || (currencyIsCustom && currencyCustom)) ? (
                                                    <button type="button" className="pointer-events-auto rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg" onClick={(e) => { e.stopPropagation(); setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setAppDirty(true) }} aria-label="Clear currency"><X className="h-3 w-3" /></button>
                                                ) : (
                                                    <ChevronDown className="h-3 w-3 text-fg-subtle" />
                                                )}
                                            </div>
                                            <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto p-1" onCloseAutoFocus={(e) => e.preventDefault()}>
                                                {(currencyCode || currencyIsCustom) && (<><DropdownMenuItem className="flex cursor-pointer items-center gap-2 text-fg-muted" onSelect={() => { setCurrencyCode(''); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false); setAppDirty(true) }}><X className="h-3.5 w-3.5 text-fg-subtle" /> Clear selection</DropdownMenuItem><DropdownMenuSeparator /></>)}
                                                {WORLD_CURRENCIES.map((cur) => (
                                                    <DropdownMenuItem key={cur.code} className="flex cursor-pointer items-center justify-between" onSelect={() => { setCurrencyCode(cur.code); setCurrencyIsCustom(false); setCurrencyCustom(''); setCurrencyOpen(false); setAppDirty(true) }}>
                                                        {cur.label}
                                                        {currencyCode === cur.code && !currencyIsCustom && <Check className="h-4 w-4 shrink-0 text-action" />}
                                                    </DropdownMenuItem>
                                                ))}
                                                <DropdownMenuSeparator />
                                                <div className="flex items-center gap-2 px-2 py-1.5">
                                                    <input value={currencyIsCustom ? currencyCustom : ''} onChange={(e) => { setCurrencyCustom(e.target.value); setCurrencyIsCustom(true); setCurrencyCode(''); setAppDirty(true) }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setCurrencyOpen(false) }} onClick={(e) => e.stopPropagation()} placeholder="Other (enter symbol)…" aria-label="Other currency symbol" className="flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle" />
                                                    {currencyIsCustom && currencyCustom && <Check className="h-4 w-4 shrink-0 text-action" />}
                                                </div>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <p className={PROPERTY_HINT_CLASS}>Prefix on contract values</p>
                                </div>
                            </PropertyRow>
                        </PropertyList>
                    </section>

                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Reminder emails</h3>
                        <SettingSwitchRow icon={<Bell />} title="Immediate notification" description="Send an email when a reminder is created." checked={immediateOnCreate} onChange={(v) => { setImmediateOnCreate(v); setAppDirty(true) }} disabled={!loaded} />
                        <SettingSwitchRow icon={<RefreshCw />} title="Recurring emails" description="Send repeat reminder emails until marked done." checked={recurringEnabled} onChange={(v) => { setRecurringEnabled(v); setAppDirty(true) }} disabled={!loaded} />
                        {recurringEnabled && (
                            <PropertyList className="mb-1 ml-6 border-l border-line pl-3">
                                <PropertyRow label="Frequency" icon={<Repeat />}>
                                    <Select value={String(recurringFrequencyDays)} onValueChange={(v) => { setRecurringFrequencyDays(Number(v)); setAppDirty(true) }} disabled={!loaded}>
                                        <SelectTrigger className={PROPERTY_FIELD_CLASS} aria-label="Reminder frequency"><SelectValue /></SelectTrigger>
                                        <SelectContent>{[1, 3, 7, 14].map((n) => <SelectItem key={n} value={String(n)}>{n === 1 ? 'Every day' : `Every ${n} days`}</SelectItem>)}</SelectContent>
                                    </Select>
                                </PropertyRow>
                                <PropertyRow label="Start" icon={<CalendarClock />}>
                                    <Select value={String(startDaysBeforeDue)} onValueChange={(v) => { setStartDaysBeforeDue(Number(v)); setAppDirty(true) }} disabled={!loaded}>
                                        <SelectTrigger className={PROPERTY_FIELD_CLASS} aria-label="Start before due date"><SelectValue /></SelectTrigger>
                                        <SelectContent>{[1, 3, 7, 14, 21, 30].map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'day' : 'days'} before due</SelectItem>)}</SelectContent>
                                    </Select>
                                </PropertyRow>
                            </PropertyList>
                        )}
                        <SettingSwitchRow icon={<MessagesSquare />} title="Email on @mention" description="Send an email when someone is @mentioned in a comment." checked={mentionEmailOnCreate} onChange={(v) => { setMentionEmailOnCreate(v); setAppDirty(true) }} disabled={!loaded} />
                    </section>

                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Event notifications</h3>
                        <p className="mb-2 text-small text-fg-muted">Choose which events send an email and which create an in-app notification. Turning in-app off silences the notification entirely.</p>
                        <NotionTable className="min-w-[420px]">
                            <NotionTableHeader>
                                <NotionTableHead>Event</NotionTableHead>
                                <NotionTableHead className="w-24 text-center">Email</NotionTableHead>
                                <NotionTableHead className="w-24 text-center">In-app</NotionTableHead>
                            </NotionTableHeader>
                            <NotionTableBody>
                                {EVENT_NOTIFICATION_ROWS.map(({ key, label }) => (
                                    <NotionTableRow key={key}>
                                        <NotionTableCell>{label}</NotionTableCell>
                                        <NotionTableCell className="text-center">
                                            <Switch checked={eventConfig[key].email} onCheckedChange={(v) => { setEventConfig((prev) => ({ ...prev, [key]: { ...prev[key], email: v } })); setAppDirty(true) }} disabled={!loaded} aria-label={`${label} — notify by email`} />
                                        </NotionTableCell>
                                        <NotionTableCell className="text-center">
                                            <Switch checked={eventConfig[key].inApp} onCheckedChange={(v) => { setEventConfig((prev) => ({ ...prev, [key]: { ...prev[key], inApp: v } })); setAppDirty(true) }} disabled={!loaded} aria-label={`${label} — in-app notification`} />
                                        </NotionTableCell>
                                    </NotionTableRow>
                                ))}
                            </NotionTableBody>
                        </NotionTable>
                    </section>

                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Overview for contributors and reviewers</h3>
                        <p className="mb-1 text-small text-fg-muted">Which sections external members see on an engagement&apos;s Overview. Internal members always see everything.</p>
                        {([
                            { label: 'Engagement health', value: extEngagementHealth, set: setExtEngagementHealth },
                            { label: 'File organization', value: extFileOrganization, set: setExtFileOrganization },
                            { label: 'Document activity', value: extDocumentActivity, set: setExtDocumentActivity },
                        ]).map(({ label, value, set }) => (
                            <SettingSwitchRow key={label} icon={<BarChart2 />} title={label} checked={value} onChange={(v) => { set(v); setAppDirty(true) }} disabled={!loaded} />
                        ))}
                    </section>

                    <section>
                        <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
                            <h3 className="text-h3 text-fg">Beta features</h3>
                            <Tag color="yellow">Beta</Tag>
                        </div>
                        {([
                            { label: 'Dossier', description: 'Enables Engagement › Dossier. Internal personas only.', value: betaDossier, set: setBetaDossier },
                            { label: 'Microsoft storage connector', description: 'Enables the Microsoft OneDrive/SharePoint document storage connector for this firm.', value: betaMicrosoftStorageConnector, set: setBetaMicrosoftStorageConnector },
                        ]).map(({ label, description, value, set }) => (
                            <SettingSwitchRow key={label} icon={<FlaskConical />} title={label} description={description} checked={value} onChange={(v) => { set(v); setAppDirty(true) }} disabled={!loaded} />
                        ))}
                    </section>

                    {appSave}
                </div>
            )}

            {/* Kept mounted while hidden: it reports the connector count that opens this tab when nothing is connected. */}
            <div className="mx-auto w-full max-w-2xl" role="tabpanel" hidden={activeTab !== 'storage'}>
                {orgId
                    ? <FirmDriveSection firmId={orgId} orgSlug={orgSlug} onConnectorsLoaded={setStorageConnectorCount} microsoftConnectorEnabled={microsoftConnectorEnabled} />
                    : <ShimmerBar className="w-48" />
                }
            </div>

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
