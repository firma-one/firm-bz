'use client'

import { useState } from 'react'
import { createWaitlistCampaign } from '@/app/actions/admin/create-waitlist-campaign'
import { closeWaitlistCampaign } from '@/app/actions/admin/close-waitlist-campaign'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface WaitlistCampaign {
    id: string
    name: string
    isActive: boolean
    openedAt: Date
    closedAt: Date | null
    _count: { waitlist: number }
}

interface CampaignManagementProps {
    batches: WaitlistCampaign[]
}

export function CampaignManagement({ batches }: CampaignManagementProps) {
    const [newBatchName, setNewBatchName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [closingId, setClosingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newBatchName.trim()) return
        setIsCreating(true)
        setError(null)
        try {
            const result = await createWaitlistCampaign(newBatchName.trim())
            if (!result.success) {
                setError(result.error || 'Failed to create campaign')
            } else {
                setNewBatchName('')
                // Reload to show updated list
                window.location.reload()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create campaign')
        } finally {
            setIsCreating(false)
        }
    }

    const handleClose = async (campaignId: string) => {
        setClosingId(campaignId)
        setError(null)
        try {
            const result = await closeWaitlistCampaign(campaignId)
            if (!result.success) {
                setError(result.error || 'Failed to close campaign')
            } else {
                window.location.reload()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to close campaign')
        } finally {
            setClosingId(null)
        }
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Campaign Management</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Manage waitlist campaigns — only one campaign can be active at a time.</p>
                </div>
            </div>

            {error && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Open New Batch form */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <form onSubmit={handleCreate} className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Campaign name (e.g. Beta Wave 1)"
                        value={newBatchName}
                        onChange={(e) => setNewBatchName(e.target.value)}
                        disabled={isCreating}
                        className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isCreating || !newBatchName.trim()}
                        className="h-9 px-4 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isCreating ? 'Opening…' : 'Open New Campaign'}
                    </button>
                </form>
                <p className="text-xs text-gray-500 mt-2">Opening a new campaign will automatically close any currently active campaign.</p>
            </div>

            {/* Batch list table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Opened</th>
                            <th className="px-4 py-3">Closed</th>
                            <th className="px-4 py-3">Entries</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {batches.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                    No campaigns yet. Open a new campaign to get started.
                                </td>
                            </tr>
                        ) : batches.map((batch) => (
                            <tr key={batch.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-medium text-gray-900">{batch.name}</td>
                                <td className="px-4 py-3">
                                    <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                        {batch.id.substring(0, 12)}…
                                    </code>
                                </td>
                                <td className="px-4 py-3">
                                    {batch.isActive ? (
                                        <Badge className="bg-green-600 hover:bg-green-700 text-white">Active</Badge>
                                    ) : (
                                        <Badge variant="secondary">Closed</Badge>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                    {formatDistanceToNow(new Date(batch.openedAt), { addSuffix: true })}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                    {batch.closedAt
                                        ? formatDistanceToNow(new Date(batch.closedAt), { addSuffix: true })
                                        : <span className="text-gray-400">—</span>
                                    }
                                </td>
                                <td className="px-4 py-3 font-medium text-gray-900">{batch._count.waitlist}</td>
                                <td className="px-4 py-3">
                                    {batch.isActive && (
                                        <button
                                            onClick={() => handleClose(batch.id)}
                                            disabled={closingId === batch.id}
                                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {closingId === batch.id ? 'Closing…' : 'Close'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
