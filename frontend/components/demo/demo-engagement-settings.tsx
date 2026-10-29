'use client'

import { useState } from 'react'
import { Activity, AlignLeft, Banknote, CalendarCheck, CalendarClock, FileText, Lock, Trash2 } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { StatusProperty } from '@/components/ui/property-cells'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import type { DemoEngagement } from '@/lib/demo/static-demo-data'

const NOT_IN_DEMO = 'Not available in this demo'
const STATUS_OPTIONS: LwCrmEngagementStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']

const formatDay = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Empty'

/**
 * Static counterpart to engagement-settings-form.tsx (Engagement › Settings): the same Details,
 * Commercial and Tracking sections and the danger zone, over the sample engagement. Fields and the
 * status change on screen; Save and Delete are inert, as nothing here is saved.
 */
export function DemoEngagementSettings({ engagement, description, kickoff }: { engagement: DemoEngagement; description: string; kickoff: string | null }) {
    const [status, setStatus] = useState<LwCrmEngagementStatus>('ACTIVE')

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-6">
            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Details</h3>
                <PropertyList>
                    <PropertyRow label="Name" icon={<FileText />}><Input defaultValue={engagement.name} aria-label="Name" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                    <PropertyRow label="Status" icon={<Activity />}>
                        <StatusProperty kind="engagement" value={status} options={STATUS_OPTIONS} onChange={(v) => setStatus(v as LwCrmEngagementStatus)} />
                    </PropertyRow>
                    <PropertyRow label="Description" icon={<AlignLeft />}>
                        <div className="flex w-full flex-col gap-1">
                            <Textarea defaultValue={description} aria-label="Description" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                            <p className="px-2 text-caption text-fg-subtle"><Brio className="text-caption" /> uses this for context when answering questions about this engagement.</p>
                        </div>
                    </PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Commercial</h3>
                <PropertyList>
                    <PropertyRow label="Contract type" icon={<FileText />}><Input defaultValue={engagement.contractType ?? ''} placeholder="Empty" aria-label="Contract type" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                    <PropertyRow label="Contract value" icon={<Banknote />}><Input defaultValue={engagement.rateOrValue ?? ''} placeholder="Empty" aria-label="Contract value" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                </PropertyList>
            </section>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Tracking</h3>
                <PropertyList>
                    <PropertyRow label="Start date" icon={<CalendarClock />}><span className="px-2 text-ui text-fg">{formatDay(kickoff)}</span></PropertyRow>
                    <PropertyRow label="End date" icon={<CalendarCheck />}><span className="px-2 text-ui text-fg">{formatDay(engagement.dueDate ?? null)}</span></PropertyRow>
                    <PropertyRow label="Internal memo" icon={<Lock />}><Textarea placeholder="Private notes about this engagement" aria-label="Internal memo" rows={3} className={PROPERTY_TEXTAREA_CLASS} /></PropertyRow>
                </PropertyList>
            </section>

            <div>
                <Hint label={NOT_IN_DEMO} side="top">
                    <span className="inline-flex"><Button type="button" variant="greenCta" disabled>Save changes</Button></span>
                </Hint>
            </div>

            <section>
                <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Danger zone</h3>
                <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <p className="text-ui font-medium text-fg">Delete engagement</p>
                        <p className="text-small text-fg-muted">Removes all members and revokes their Drive access. The folder stays in Google Drive for the firm admin.</p>
                    </div>
                    <Hint label={NOT_IN_DEMO} side="top">
                        <span className="inline-flex shrink-0">
                            <Button type="button" variant="outline" disabled className="text-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" />Delete engagement</Button>
                        </span>
                    </Hint>
                </div>
            </section>
        </div>
    )
}
