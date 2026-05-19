"use client"

import { useState, useEffect, useMemo } from "react"
import Link from 'next/link'
import { StorageUsageBar } from '@/components/dashboard/storage-usage-bar'
import {
    TrendingUp,
    Zap,
    HardDrive,
    Share2,
    Clock,
    RefreshCw,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { DriveFile } from "@/lib/types"

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
    const colorClasses: Record<string, string> = {
        purple: "bg-purple-50 text-purple-600",
        green: "bg-green-50 text-green-600",
        blue: "bg-blue-50 text-blue-600",
        amber: "bg-amber-50 text-amber-600",
        indigo: "bg-indigo-50 text-indigo-600",
    }
    const bgClass = colorClasses[color] || colorClasses.blue

    return (
        <div className="bg-white rounded p-4 border border-[#e5e7eb] shadow-sm flex items-center gap-3">
            <div className={`p-2.5 rounded shrink-0 ${bgClass}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900 leading-none shrink-0">{value}</p>
            <p className="text-xs text-gray-500 font-medium leading-snug">{label}</p>
        </div>
    )
}


export function DriveInsightsSection() {
    const { session } = useAuth()

    const [recentFiles, setRecentFiles] = useState<DriveFile[]>([])
    const [accessedFiles, setAccessedFiles] = useState<DriveFile[]>([])
    const [storageFiles, setStorageFiles] = useState<DriveFile[]>([])
    const [sharedFiles, setSharedFiles] = useState<DriveFile[]>([])
    const [summaryExtra, setSummaryExtra] = useState<{
        storageByType: { label: string; bytes: number }[]
        expiringLinksCount: number
        totalSampled: number
    } | null>(null)
    const [loading, setLoading] = useState(true)
    const [isConnected, setIsConnected] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    interface QuotaState {
        limit: number
        used: number
        accounts: { id: string, email: string, limit: number, used: number, usageInDrive?: number, usageInDriveTrash?: number }[]
    }
    const [quota, setQuota] = useState<QuotaState | null>(null)
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
    const [isRefreshing, setIsRefreshing] = useState(false)

    useEffect(() => {
        const abort = new AbortController()

        async function loadData() {
            if (!session?.access_token) return
            setLoading(true)
            try {
                const headers = { 'Authorization': `Bearer ${session.access_token}` }
                const connectorRes = await fetch('/api/connectors/google-drive?action=status', { headers, signal: abort.signal })
                if (abort.signal.aborted) return
                if (connectorRes.ok) {
                    const connectorData = await connectorRes.json()
                    setIsConnected(!!connectorData.isConnected)
                } else {
                    setIsConnected(false)
                }

                const [metricsRes, recentRes, trendingRes, storageRes, sharingRes] = await Promise.allSettled([
                    fetch('/api/drive-metrics', { headers, signal: abort.signal }),
                    fetch('/api/drive-metrics?range=1w&limit=50', { headers, signal: abort.signal }),
                    fetch('/api/drive-metrics?sort=accessed&range=1w&limit=50', { headers, signal: abort.signal }),
                    fetch('/api/drive-metrics?sort=storage&limit=50', { headers, signal: abort.signal }),
                    fetch('/api/drive-metrics?sort=shared&limit=50', { headers, signal: abort.signal }),
                ])
                if (abort.signal.aborted) return

                if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
                    const metricsData = await metricsRes.value.json()
                    if (metricsData.storageUsage) {
                        setQuota({
                            limit: metricsData.storageUsage.limit,
                            used: metricsData.storageUsage.used,
                            accounts: metricsData.storageUsage.accounts ?? [],
                        })
                        setSelectedAccounts(metricsData.storageUsage.accounts?.map((a: any) => a.id) ?? [])
                    }
                }
                if (recentRes.status === 'fulfilled' && recentRes.value.ok) {
                    const d = await recentRes.value.json()
                    setRecentFiles(d.data ?? [])
                }
                if (trendingRes.status === 'fulfilled' && trendingRes.value.ok) {
                    const d = await trendingRes.value.json()
                    setAccessedFiles(d.data ?? [])
                }
                if (storageRes.status === 'fulfilled' && storageRes.value.ok) {
                    const d = await storageRes.value.json()
                    setStorageFiles(d.data ?? [])
                }
                if (sharingRes.status === 'fulfilled' && sharingRes.value.ok) {
                    const d = await sharingRes.value.json()
                    setSharedFiles(d.data ?? [])
                }

                if (!abort.signal.aborted) setIsRefreshing(false)
            } catch (err: any) {
                if (err?.name === 'AbortError') return
                console.error('Failed to load insights data', err)
                setIsRefreshing(false)
            } finally {
                if (!abort.signal.aborted) setLoading(false)
            }
        }
        loadData()
        return () => abort.abort()
    }, [session, refreshTrigger])

    useEffect(() => {
        async function loadSummaryExtra() {
            if (!session?.access_token || !isConnected) return
            const cacheExtraKey = 'insights_summary_extra_v4'
            const cacheTimestampKey = 'insights_summary_metrics_timestamp'
            const cachedExtra = localStorage.getItem(cacheExtraKey)
            const cachedTimestamp = localStorage.getItem(cacheTimestampKey)

            if (cachedExtra && cachedTimestamp) {
                const age = Date.now() - parseInt(cachedTimestamp)
                if (refreshTrigger === 0 && age < 5 * 60 * 1000) {
                    setSummaryExtra(JSON.parse(cachedExtra))
                    return
                }
            }

            try {
                const headers = { 'Authorization': `Bearer ${session.access_token}` }
                const res = await fetch(`/api/drive-summary`, { headers })
                if (res.ok) {
                    const data = await res.json()
                    const extra = {
                        storageByType: data.storageByType ?? [],
                        expiringLinksCount: data.expiringLinksCount ?? 0,
                        totalSampled: data.totalSampled ?? 0,
                    }
                    setSummaryExtra(extra)
                    localStorage.setItem(cacheExtraKey, JSON.stringify(extra))
                    localStorage.setItem(cacheTimestampKey, Date.now().toString())
                }
            } catch (err) {
                console.error('Failed to load summary metrics', err)
            }
        }

        if (isConnected) {
            const timer = setTimeout(() => { loadSummaryExtra() }, 2000)
            return () => clearTimeout(timer)
        }
    }, [session, isConnected, refreshTrigger])

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const getFilteredQuota = () => {
        if (!quota || !quota.accounts) return { used: 0, limit: 0, showFilter: false, accounts: [] }
        const showFilter = quota.accounts.length > 1
        const filtered = quota.accounts.filter(a => selectedAccounts.includes(a.id))
        const used = filtered.reduce((acc, curr) => acc + curr.used, 0)
        const limit = filtered.reduce((acc, curr) => acc + curr.limit, 0)
        return { used, limit, showFilter, accounts: quota.accounts }
    }

    const { used: filteredUsed, limit: filteredLimit, accounts: availableAccounts } = getFilteredQuota()
    const realTotal = quota ? formatSize(filteredLimit) : '100 GB'
    const realUsed = quota ? `${formatSize(filteredUsed)} (${filteredLimit > 0 ? ((filteredUsed / filteredLimit) * 100).toFixed(2) : '0.00'}%)` : '50 GB'
    const baseUsage = quota ? filteredUsed : (50 * 1024 * 1024 * 1024)
    const baseLimit = quota ? filteredLimit : (100 * 1024 * 1024 * 1024)

    const { storageBarItems, storageLegendItems, storageBreakdownItems } = useMemo(() => {
        const COLORS: Record<string, string> = {
            Documents: 'bg-blue-300',
            Spreadsheets: 'bg-teal-300',
            Images: 'bg-indigo-400',
            Videos: 'bg-purple-500',
            Audio: 'bg-pink-400',
            'Drive Files': 'bg-purple-400',
            'Drive Trash': 'bg-red-300',
            Other: 'bg-gray-300',
        }
        const totalBytes = baseLimit > 0 ? baseLimit : 1
        const usedPct = Math.min(100, (baseUsage / totalBytes) * 100)
        const freeBytes = Math.max(0, baseLimit - baseUsage)

        const freePct = Math.max(0, 100 - usedPct)
        const barItems = [
            { label: 'Used', percentage: usedPct, size: formatSize(baseUsage), color: 'bg-purple-500' },
            { label: 'Free', percentage: freePct, size: formatSize(freeBytes), color: 'bg-gray-200' },
        ]

        const typeData = summaryExtra?.storageByType ?? []
        const typeBreakdown = typeData.map(({ label, bytes }) => ({
            label,
            percentage: baseUsage > 0 ? (bytes / baseUsage) * 100 : 0,
            size: formatSize(bytes),
            color: COLORS[label] ?? 'bg-gray-300',
        })).filter(t => t.percentage > 0)

        // Main legend: just Used + Free (type breakdown visible on drill-in)
        const legendItems = [
            { label: 'Used', percentage: usedPct, size: formatSize(baseUsage), color: 'bg-purple-500' },
            { label: 'Free', percentage: freePct, size: formatSize(freeBytes), color: 'bg-gray-200' },
        ]

        return { storageBarItems: barItems, storageLegendItems: legendItems, storageBreakdownItems: typeBreakdown }
    }, [summaryExtra, baseUsage, baseLimit])

    // Derived activity counts for stat cards
    const trendingActionCount = accessedFiles.reduce((acc, f) => acc + (f.activityCount || 0), 0)
    const largeFilesCount = storageFiles.filter(f => Number(f.size || 0) > 100 * 1024 * 1024).length
    const uniqueSharedCount = new Set(sharedFiles.map(f => f.id)).size

    if (loading) {
        return (
            <div className="py-8 flex items-center justify-center">
                <LoadingSpinner size="lg" message="Loading Drive insights..." />
            </div>
        )
    }

    if (!isConnected) {
        return (
            <div className="py-8 flex flex-col items-center justify-center text-center bg-white rounded border border-[#e5e7eb]">
                <div className="p-4 bg-white rounded-full mb-4 shadow-sm">
                    <Zap className="h-10 w-10 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Google Drive</h2>
                <p className="text-sm text-gray-500 mb-4">Connect your Google Drive to see Drive storage analytics here.</p>
                <Link href="/dash/connectors" className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-full hover:bg-indigo-700 shadow-lg shadow-indigo-200 text-sm">
                    Go to Connectors
                </Link>
            </div>
        )
    }

    return (
        <div className="bg-white border border-[#e5e7eb] rounded p-6 shadow-sm">
            <div className="flex gap-6 items-start">
                {/* Left: main content */}
                <div className="flex-1 min-w-0 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Google Drive Storage</span>
                            <h2 className="text-xl font-bold text-gray-900 mt-1">Document Insights</h2>
                            <p className="text-gray-500 text-sm mt-0.5">Optimization &amp; Security Intelligence</p>
                        </div>
                        <button onClick={() => setRefreshTrigger(prev => prev + 1)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors" title="Refresh data">
                            <RefreshCw className={`h-4 w-4 text-gray-700 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    <StorageUsageBar
                        totalUsed={realUsed}
                        totalCapacity={realTotal}
                        items={storageBarItems}
                        legendItems={storageLegendItems}
                        breakdownItems={storageBreakdownItems}
                        accounts={availableAccounts}
                        selectedAccounts={selectedAccounts}
                        onAccountToggle={(id) => {
                            if (selectedAccounts.includes(id)) {
                                if (selectedAccounts.length > 1) setSelectedAccounts(selectedAccounts.filter(accId => accId !== id))
                            } else {
                                setSelectedAccounts([...selectedAccounts, id])
                            }
                        }}
                        onSelectAll={() => {
                            const allIds = availableAccounts.map(a => a.id)
                            if (selectedAccounts.length !== allIds.length) setSelectedAccounts(allIds)
                        }}
                    />

                    {/* Activity statistics */}
                    <div>
                        <h3 className="text-base font-semibold text-gray-700 mb-3">Activity This Week</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard icon={Clock} label="Files Active" value={recentFiles.length} color="blue" />
                            <StatCard icon={TrendingUp} label="Trending Actions" value={trendingActionCount} color="indigo" />
                            <StatCard icon={HardDrive} label="Large Files (>100 MB)" value={largeFilesCount} color="purple" />
                            <StatCard icon={Share2} label="Shared Files" value={uniqueSharedCount} color="amber" />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
