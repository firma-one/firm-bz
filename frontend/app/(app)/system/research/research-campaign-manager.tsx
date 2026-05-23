'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Shield, ChevronRight, Plus, Copy, Check, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { createResearchCampaign } from '@/app/actions/admin/create-research-campaign'
import { updateResearchCampaign } from '@/app/actions/admin/update-research-campaign'
import { setResearchCampaignStatus } from '@/app/actions/admin/set-research-campaign-status'
import { deleteResearchCampaign } from '@/app/actions/admin/delete-research-campaign'
import { getPlatformSiteOrigin } from '@/config/platform-domain'

type Status = 'DRAFT' | 'ACTIVE' | 'CLOSED'

interface QueryParam {
    key: string
    value: string
}

interface Campaign {
    id: string
    description: string | null
    scriptSnippet: string | null
    queryParams: QueryParam[]
    status: Status
    closedAt: Date | null
    createdAt: Date
}

interface CampaignFormState {
    description: string
    scriptSnippet: string
    queryParams: QueryParam[]
    isSaving: boolean
    error: string | null
}

const BLANK_FORM: CampaignFormState = {
    description: '',
    scriptSnippet: '',
    queryParams: [],
    isSaving: false,
    error: null,
}

function StatusBadge({ status, closedAt }: { status: Status; closedAt: Date | null }) {
    if (status === 'ACTIVE') return <Badge className="bg-green-600 hover:bg-green-700 text-white">Active</Badge>
    if (status === 'CLOSED') return (
        <span className="text-xs text-gray-400">
            Closed {closedAt ? formatDistanceToNow(new Date(closedAt), { addSuffix: true }) : ''}
        </span>
    )
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Draft</Badge>
}

function buildShareableUrl(id: string, params: QueryParam[], origin: string) {
    const base = `${origin}/go/${id}`
    const valid = params.filter(p => p.key.trim())
    if (!valid.length) return base
    const qs = new URLSearchParams(valid.map(p => [p.key.trim(), p.value]))
    return `${base}?${qs}`
}

export function ResearchCampaignManager({ campaigns: initial }: { campaigns: Campaign[] }) {
    const [campaigns, setCampaigns] = useState<Campaign[]>(initial)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [formStates, setFormStates] = useState<Record<string, CampaignFormState>>({})
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [siteOrigin, setSiteOrigin] = useState(getPlatformSiteOrigin())

    useEffect(() => {
        setSiteOrigin(window.location.origin)
    }, [])

    const getForm = (campaign: Campaign): CampaignFormState =>
        formStates[campaign.id] ?? {
            description: campaign.description ?? '',
            scriptSnippet: campaign.scriptSnippet ?? '',
            queryParams: Array.isArray(campaign.queryParams) ? campaign.queryParams : [],
            isSaving: false,
            error: null,
        }

    const setForm = (id: string, patch: Partial<CampaignFormState>) =>
        setFormStates(prev => ({
            ...prev,
            [id]: { ...(prev[id] ?? BLANK_FORM), ...patch },
        }))

    const handleCreate = async () => {
        setIsCreating(true)
        const result = await createResearchCampaign()
        setIsCreating(false)
        if (!result.success || !result.data) return
        const newCampaign: Campaign = {
            id: result.data.id,
            description: null,
            scriptSnippet: null,
            queryParams: [],
            status: 'DRAFT',
            closedAt: null,
            createdAt: new Date(),
        }
        setCampaigns(prev => [newCampaign, ...prev])
        setExpandedId(result.data.id)
    }

    const handleSave = async (campaign: Campaign) => {
        const form = getForm(campaign)
        setForm(campaign.id, { isSaving: true, error: null })
        const result = await updateResearchCampaign(campaign.id, {
            description: form.description,
            scriptSnippet: form.scriptSnippet,
            queryParams: form.queryParams.filter(p => p.key.trim()),
        })
        if (!result.success) {
            setForm(campaign.id, { isSaving: false, error: result.error ?? 'Failed to save' })
            return
        }
        setCampaigns(prev => prev.map(c =>
            c.id === campaign.id
                ? {
                    ...c,
                    description: form.description || null,
                    scriptSnippet: form.scriptSnippet || null,
                    queryParams: form.queryParams.filter(p => p.key.trim()),
                }
                : c
        ))
        setForm(campaign.id, { isSaving: false })
        setExpandedId(null)
    }

    const handleSetStatus = async (campaign: Campaign, status: Status) => {
        const result = await setResearchCampaignStatus(campaign.id, status)
        if (!result.success) return
        setCampaigns(prev => prev.map(c =>
            c.id === campaign.id
                ? { ...c, status, closedAt: status === 'CLOSED' ? new Date() : c.closedAt }
                : c
        ))
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this campaign? This cannot be undone.')) return
        const result = await deleteResearchCampaign(id)
        if (!result.success) return
        setCampaigns(prev => prev.filter(c => c.id !== id))
        if (expandedId === id) setExpandedId(null)
    }

    const handleCopyUrl = async (campaign: Campaign) => {
        const form = getForm(campaign)
        const url = buildShareableUrl(campaign.id, form.queryParams, siteOrigin)
        await navigator.clipboard.writeText(url).catch(() => null)
        setCopiedId(campaign.id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const addParam = (id: string) => {
        setFormStates(prev => {
            const form = prev[id] ?? BLANK_FORM
            return { ...prev, [id]: { ...form, queryParams: [...form.queryParams, { key: '', value: '' }] } }
        })
    }

    const updateParam = (id: string, index: number, field: 'key' | 'value', val: string) => {
        setFormStates(prev => {
            const form = prev[id] ?? BLANK_FORM
            return {
                ...prev,
                [id]: { ...form, queryParams: form.queryParams.map((p, i) => i === index ? { ...p, [field]: val } : p) },
            }
        })
    }

    const removeParam = (id: string, index: number) => {
        setFormStates(prev => {
            const form = prev[id] ?? BLANK_FORM
            return {
                ...prev,
                [id]: { ...form, queryParams: form.queryParams.filter((_, i) => i !== index) },
            }
        })
    }

    return (
        <div className="flex flex-col space-y-8">
            {/* Breadcrumb + header */}
            <div className="flex flex-col space-y-4">
                <nav className="flex items-center text-sm text-gray-500">
                    <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
                        <Shield className="w-4 h-4" />
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <Link href="/system" className="hover:text-gray-900 transition-colors">Administration</Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <span className="font-medium text-gray-900">Research Campaigns</span>
                </nav>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Research Campaigns</h1>
                        <p className="text-gray-500 mt-1">Create shareable pages with embedded forms and UTM-tracked links.</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {isCreating ? 'Creating…' : 'New Campaign'}
                    </button>
                </div>
            </div>

            {/* Campaign list */}
            <div className="flex flex-col gap-3">
                {campaigns.length === 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
                        No campaigns yet. Click "New Campaign" to get started.
                    </div>
                )}

                {campaigns.map(campaign => {
                    const form = getForm(campaign)
                    const isExpanded = expandedId === campaign.id
                    const isClosed = campaign.status === 'CLOSED'
                    const shareUrl = buildShareableUrl(campaign.id, form.queryParams, siteOrigin)
                    const urlCopied = copiedId === campaign.id

                    return (
                        <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            {/* Collapsed header */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                    {isExpanded
                                        ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                                        : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                    }
                                    <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                                        {campaign.id.substring(0, 14)}…
                                    </code>
                                    <span className="text-xs text-gray-400 shrink-0">
                                        {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                                    </span>
                                </button>

                                <div className="flex items-center gap-2 shrink-0">
                                    <StatusBadge status={campaign.status} closedAt={campaign.closedAt} />

                                    {campaign.status === 'DRAFT' && (
                                        <button
                                            onClick={() => handleSetStatus(campaign, 'ACTIVE')}
                                            className="text-xs font-medium text-green-700 hover:text-green-900 border border-green-200 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded transition-colors"
                                        >
                                            Publish
                                        </button>
                                    )}
                                    {campaign.status === 'ACTIVE' && (
                                        <button
                                            onClick={() => handleSetStatus(campaign, 'CLOSED')}
                                            className="text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition-colors"
                                        >
                                            Close
                                        </button>
                                    )}
                                    {campaign.status === 'CLOSED' && (
                                        <button
                                            onClick={() => handleSetStatus(campaign, 'DRAFT')}
                                            className="text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded transition-colors"
                                        >
                                            Reopen
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleCopyUrl(campaign)}
                                        disabled={isClosed}
                                        title={isClosed ? 'Campaign is closed' : 'Copy shareable URL'}
                                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {urlCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        {urlCopied ? 'Copied' : 'Copy URL'}
                                    </button>

                                    <button
                                        onClick={() => handleDelete(campaign.id)}
                                        className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                                        title="Delete campaign"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded form */}
                            {isExpanded && (
                                <div className="border-t border-gray-100 px-5 py-5 space-y-5 bg-gray-50/40">
                                    {form.error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                            {form.error}
                                        </div>
                                    )}

                                    {/* Description */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                            Description <span className="font-normal normal-case text-gray-400">(optional)</span>
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="Brief description of this research campaign…"
                                            value={form.description}
                                            disabled={isClosed}
                                            onChange={e => setForm(campaign.id, { description: e.target.value })}
                                            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                                        />
                                    </div>

                                    {/* Embed script */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                            Embed Script
                                        </label>
                                        <p className="text-xs text-gray-400">
                                            Paste the JS embed snippet from any form platform — Tally, Typeform, HubSpot, etc.
                                        </p>
                                        <textarea
                                            rows={7}
                                            placeholder={'<div data-tally-src="..."></div>\n<script>...</script>'}
                                            value={form.scriptSnippet}
                                            disabled={isClosed}
                                            onChange={e => setForm(campaign.id, { scriptSnippet: e.target.value })}
                                            className="w-full text-xs font-mono border border-gray-200 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                                        />
                                    </div>

                                    {/* Query params */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                            Query Parameters <span className="font-normal normal-case text-gray-400">(e.g. utm_source, utm_medium)</span>
                                        </label>
                                        <div className="space-y-2">
                                            {form.queryParams.map((param, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="key"
                                                        value={param.key}
                                                        disabled={isClosed}
                                                        onChange={e => updateParam(campaign.id, i, 'key', e.target.value)}
                                                        className="flex-1 h-8 px-2.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="value"
                                                        value={param.value}
                                                        disabled={isClosed}
                                                        onChange={e => updateParam(campaign.id, i, 'value', e.target.value)}
                                                        className="flex-1 h-8 px-2.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono"
                                                    />
                                                    {!isClosed && (
                                                        <button
                                                            onClick={() => removeParam(campaign.id, i)}
                                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {!isClosed && (
                                                <button
                                                    onClick={() => addParam(campaign.id)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                                                >
                                                    + Add parameter
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Shareable URL preview */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                            Shareable URL
                                        </label>
                                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2">
                                            <code className="text-xs font-mono text-gray-600 flex-1 break-all">{shareUrl}</code>
                                            <button
                                                onClick={() => handleCopyUrl(campaign)}
                                                disabled={isClosed}
                                                className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {urlCopied ? <><Check className="w-3 h-3 text-green-600" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {!isClosed && (
                                        <div className="flex items-center gap-3 pt-1">
                                            <button
                                                onClick={() => handleSave(campaign)}
                                                disabled={form.isSaving}
                                                className="h-9 px-5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {form.isSaving ? 'Saving…' : 'Save'}
                                            </button>
                                            <button
                                                onClick={() => setExpandedId(null)}
                                                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
