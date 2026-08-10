import { AlertCircle, CheckCircle2, ChevronRight, Clock, FileWarning, FolderOpen, HardDrive, MessageSquare, Share2 } from 'lucide-react'
import { DemoFirm } from '@/lib/demo/static-demo-data'

interface DueBucket {
    overdue: number
    upcoming: number
    overdueLabel: string
    upcomingLabel: string
}

function computeDueBuckets(firm: DemoFirm): DueBucket {
    const engagements = firm.clients.flatMap((c) => c.engagements)
    const today = new Date(); today.setHours(0, 0, 0, 0)

    let overdue = 0
    let upcoming = 0
    engagements.forEach((e) => {
        if (!e.dueDate) return
        const due = new Date(e.dueDate); due.setHours(0, 0, 0, 0)
        const days = Math.round((due.getTime() - today.getTime()) / 86400000)
        if (days < 0) overdue++
        else upcoming++
    })

    return {
        overdue,
        upcoming,
        overdueLabel: `${overdue} engagement${overdue === 1 ? '' : 's'}`,
        upcomingLabel: `${upcoming} engagement${upcoming === 1 ? '' : 's'}`,
    }
}

/** Static counterpart to firm-action-center.tsx — summary view only, computed from real DEMO_FIRM due dates. Threads/Document Alerts have no comparable static data source, so they render their real "all caught up" empty states rather than invented activity. */
export function DemoFirmActionCenter({ firm }: { firm: DemoFirm }) {
    const { overdue, upcoming, overdueLabel, upcomingLabel } = computeDueBuckets(firm)

    return (
        <div
            className="flex flex-col gap-3 border border-[#e5e7eb] rounded p-4 h-full"
            style={{
                backgroundColor: '#ffffff',
                background: [
                    'linear-gradient(135deg, rgba(243,244,246,0.3) 25%, transparent 25%) -10px 0 / 20px 20px',
                    'linear-gradient(225deg, rgba(243,244,246,0.5) 25%, transparent 25%) -10px 0 / 20px 20px',
                    'linear-gradient(315deg, rgba(243,244,246,0.3) 25%, transparent 25%) 0px 0 / 20px 20px',
                    'linear-gradient(45deg, rgba(243,244,246,0.5) 25%, #ffffff 25%) 0px 0 / 20px 20px',
                ].join(', '),
            }}
        >
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Action Center</h3>
            </div>

            <div className="flex flex-col gap-3">
                {overdue === 0 && upcoming === 0 ? (
                    <div className="flex items-center gap-2 p-3 rounded bg-green-50 border border-green-100">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span className="text-xs text-green-700">All caught up — no pending actions</span>
                    </div>
                ) : (
                    <>
                        {overdue > 0 && (
                            <div className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#d1d5db] shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-red-50">
                                        <AlertCircle className="h-4 w-4 text-red-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-red-700">Overdue</p>
                                        <p className="text-xs text-gray-500">{overdueLabel}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-bold text-red-600">{overdue}</span>
                                    <ChevronRight className="h-4 w-4 text-red-400" />
                                </div>
                            </div>
                        )}
                        {upcoming > 0 && (
                            <div className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#d1d5db] shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-50">
                                        <Clock className="h-4 w-4 text-amber-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-amber-700">Upcoming</p>
                                        <p className="text-xs text-gray-500">{upcomingLabel}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-bold text-amber-600">{upcoming}</span>
                                    <ChevronRight className="h-4 w-4 text-amber-400" />
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#d1d5db] shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-50">
                            <MessageSquare className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-semibold text-purple-700">Unanswered Threads</p>
                            <p className="text-xs text-gray-500">Awaiting firm response</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-lg font-bold text-purple-600">0</span>
                        <ChevronRight className="h-4 w-4 text-purple-400" />
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Alerts</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {[
                            { icon: Share2, label: 'Sharing' },
                            { icon: FileWarning, label: 'Sensitive' },
                            { icon: HardDrive, label: 'Storage' },
                        ].map(({ icon: Icon, label }) => (
                            <div
                                key={label}
                                className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#d1d5db] shadow-md"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-green-50">
                                        <Icon className="h-4 w-4 text-green-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-green-700">{label}</p>
                                        <p className="text-xs text-gray-500">No alerts</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-bold text-green-600">0</span>
                                    <ChevronRight className="h-4 w-4 text-green-400" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
