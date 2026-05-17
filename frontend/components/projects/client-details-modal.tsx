'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientSummary } from '@/lib/actions/hierarchy'
import { Users, Building, Calendar, Clock, Tag, TrendingUp, GitBranch, CalendarClock, Lock, Linkedin, Users2, MapPin } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { formatFullDate } from '@/lib/utils'
import { Globe, Link2 } from 'lucide-react'

function formatClientStatus(status: string | null | undefined): string {
    switch (status) {
        case 'PROSPECT':
            return 'Prospect'
        case 'ON_HOLD':
            return 'On hold'
        case 'PAST':
            return 'Past'
        case 'ACTIVE':
        default:
            return 'Active'
    }
}

interface ClientDetailsModalProps {
    client: ClientSummary | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ClientDetailsModal({ client, open, onOpenChange }: ClientDetailsModalProps) {
    if (!client) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5 text-xl">
                        <Users className="h-6 w-6 text-slate-600" />
                        {client.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Status */}
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Tag className="h-4 w-4 text-slate-600" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Status</div>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                                    {formatClientStatus(client.status)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Website */}
                    {client.website && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Globe className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Website</div>
                                <a
                                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-blue-600 hover:underline break-all flex items-center gap-1"
                                >
                                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                                    {client.website}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    {client.description && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Tag className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Notes</div>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{client.description}</div>
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    {(client.tags?.length ?? 0) > 0 && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Tag className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Tags</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {client.tags!.map((t: string) => (
                                        <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-md">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Industry */}
                    {client.industry && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Building className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Industry</div>
                                <div className="text-sm font-medium text-slate-900">{client.industry}</div>
                            </div>
                        </div>
                    )}

                    {/* Sector */}
                    {client.sector && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Building className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Sector</div>
                                <div className="text-sm font-medium text-slate-900">{client.sector}</div>
                            </div>
                        </div>
                    )}

                    {/* Relationship Value */}
                    {client.relationshipValue && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <TrendingUp className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Relationship Value</div>
                                <div className="text-sm font-medium text-slate-900">
                                    ${Number(client.relationshipValue).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Lead Source (PROSPECT only) */}
                    {client.status === 'PROSPECT' && client.leadSource && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <GitBranch className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Lead Source</div>
                                <div className="text-sm font-medium text-slate-900">{client.leadSource}</div>
                            </div>
                        </div>
                    )}

                    {/* Follow-up / Expected Close (PROSPECT only) */}
                    {client.status === 'PROSPECT' && client.followUpDate && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <CalendarClock className="h-4 w-4 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Follow-up Date</div>
                                <div className="text-sm font-medium text-slate-900">
                                    {format(new Date(client.followUpDate), 'd MMM yyyy')}
                                </div>
                            </div>
                        </div>
                    )}

                    {client.status === 'PROSPECT' && client.expectedCloseDate && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Calendar className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Expected Close</div>
                                <div className="text-sm font-medium text-slate-900">
                                    {format(new Date(client.expectedCloseDate), 'd MMM yyyy')}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Internal Memo */}
                    {client.internalMemo && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Lock className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                                    Internal Memo
                                    <span className="text-[10px] font-normal bg-slate-100 text-slate-400 px-1 rounded">internal only</span>
                                </div>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{client.internalMemo}</div>
                            </div>
                        </div>
                    )}

                    {/* Client Since */}
                    {client.clientSinceDate && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Calendar className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Client Since</div>
                                <div className="text-sm font-medium text-slate-900">
                                    {format(new Date(client.clientSinceDate), 'd MMM yyyy')}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* LinkedIn */}
                    {client.linkedInUrl && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Linkedin className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Company LinkedIn</div>
                                <a
                                    href={client.linkedInUrl.startsWith('http') ? client.linkedInUrl : `https://${client.linkedInUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-blue-600 hover:underline break-all"
                                >
                                    {client.linkedInUrl}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Company Size */}
                    {client.companySizeBracket && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Users2 className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Company Size</div>
                                <div className="text-sm font-medium text-slate-900">{client.companySizeBracket}</div>
                            </div>
                        </div>
                    )}

                    {/* Billing Address */}
                    {client.billingAddress && (
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <MapPin className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Billing Address</div>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{client.billingAddress}</div>
                            </div>
                        </div>
                    )}

                    {/* Projects Count */}
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-slate-600" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Projects</div>
                            <div className="text-sm font-medium text-slate-900">{client.engagements.length} Active Engagements</div>
                        </div>
                    </div>

                    {/* Created Date */}
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Calendar className="h-4 w-4 text-slate-600" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Created</div>
                            <div className="text-sm font-medium text-slate-900">
                                {formatFullDate(client.createdAt)}
                            </div>
                        </div>
                    </div>

                    {/* Last Updated */}
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Clock className="h-4 w-4 text-slate-600" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Last Updated</div>
                            <div className="text-sm font-medium text-slate-900">
                                {formatDistanceToNow(new Date(client.updatedAt), { addSuffix: true })}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
