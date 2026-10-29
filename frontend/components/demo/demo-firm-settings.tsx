'use client'

import { useId, useState, type ReactNode } from 'react'
import { AtSign, Bell, BarChart2, Building2, DollarSign, Factory, FileText, Globe, Lock, MessagesSquare, Palette, RefreshCw, Shield, Trash2, Type, User, Users2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { GoogleDriveIcon } from '@/components/ui/google-drive-icon'
import { NotionTable, NotionTableBody, NotionTableCell, NotionTableHead, NotionTableHeader, NotionTableRow } from '@/components/ui/notion-table'
import { PropertyList, PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS, PROPERTY_TEXTAREA_CLASS, SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { FirmMark } from '@/components/shell/workspace-switcher'
import { cn } from '@/lib/utils'
import type { DemoFirm } from '@/lib/demo/static-demo-data'

const NOT_IN_DEMO = 'Not available in this demo'
const DOMAIN = 'beacongrowth.example'

type Tab = 'main' | 'branding' | 'appsettings' | 'storage'
const TABS: { value: Tab; label: string }[] = [
    { value: 'main', label: 'General' },
    { value: 'branding', label: 'Branding' },
    { value: 'appsettings', label: 'App settings' },
    { value: 'storage', label: 'Storage' },
]

/** As firm-settings-form.tsx lists them. */
const EVENT_ROWS: { label: string; email: boolean; inApp: boolean }[] = [
    { label: 'New document intake', email: true, inApp: true },
    { label: 'Status changed (doc/deliverable)', email: false, inApp: true },
    { label: 'Document rejected', email: true, inApp: true },
    { label: 'Client comment posted', email: true, inApp: true },
    { label: 'Engagement invite accepted', email: false, inApp: true },
    { label: 'Deliverable overdue', email: true, inApp: true },
    { label: 'Reminders due (in-app also enables push)', email: true, inApp: true },
]

/** The app's Save, inert here with the demo's hint. Hint needs a ref-taking child, so a span. */
function InertSave({ children = 'Save changes' }: { children?: ReactNode }) {
    return (
        <Hint label={NOT_IN_DEMO} side="top">
            <span className="inline-flex"><Button type="button" variant="greenCta" disabled>{children}</Button></span>
        </Hint>
    )
}

/** As firm-settings-form.tsx's SettingSwitchRow: what it does on the left, the switch on the right. Toggles on screen. */
function SwitchRow({ icon, title, description, initial }: { icon: ReactNode; title: ReactNode; description?: ReactNode; initial: boolean }) {
    const id = useId()
    const [on, setOn] = useState(initial)
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex shrink-0 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
                <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <span className="block text-ui text-fg">{title}</span>
                    {description && <span className="mt-0.5 block text-small text-fg-muted">{description}</span>}
                </label>
            </div>
            <Switch id={id} checked={on} onCheckedChange={setOn} />
        </div>
    )
}

/**
 * Static counterpart to firm-settings-form.tsx (Firm › Settings): the same four tabs and sections
 * over the sample firm. Fields and switches change on screen; Save, Delete and the storage
 * connection are inert, as nothing here is saved.
 */
export function DemoFirmSettings({ firm }: { firm: DemoFirm }) {
    const [tab, setTab] = useState<Tab>('main')

    return (
        <div className="flex flex-col">
            <div className="mb-6 flex items-end gap-1 border-b border-line" role="tablist" aria-label="Settings sections" data-demo-tour="firm-settings-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.value}
                        onClick={() => setTab(t.value)}
                        className={cn('relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2 text-ui transition-colors', tab === t.value ? 'border-fg text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'main' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" role="tabpanel">
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Details</h3>
                        <PropertyList>
                            <PropertyRow label="Firm name" icon={<Building2 />}><Input defaultValue={firm.name} aria-label="Firm name" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                            <PropertyRow label="Industry" icon={<Factory />}><Input defaultValue="Growth marketing consultancy" aria-label="Industry" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                            <PropertyRow label="Company size" icon={<Users2 />}><Input defaultValue="11–50" aria-label="Company size" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                            <PropertyRow label="Website" icon={<Globe />}><Input defaultValue={`https://${DOMAIN}`} aria-label="Website" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                            <PropertyRow label="Notes" icon={<FileText />}><Textarea placeholder="Additional details about the firm" aria-label="Notes" rows={3} className={PROPERTY_TEXTAREA_CLASS} /></PropertyRow>
                            <PropertyRow label="Internal memo" icon={<Lock />}>
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <Textarea defaultValue="Q4 focus: expand the retainer book with existing clients." aria-label="Internal memo" rows={3} className={PROPERTY_TEXTAREA_CLASS} />
                                    <p className={PROPERTY_HINT_CLASS}>Only firm admins see this.</p>
                                </div>
                            </PropertyRow>
                        </PropertyList>
                    </section>
                    <div><InertSave /></div>
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Danger zone</h3>
                        <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <div className="min-w-0">
                                <p className="text-ui font-medium text-fg">Delete firm</p>
                                <p className="text-small text-fg-muted">Permanently deletes this firm. All clients, engagements and members are removed. This cannot be undone.</p>
                            </div>
                            <Hint label={NOT_IN_DEMO} side="top">
                                <span className="inline-flex shrink-0">
                                    <Button type="button" variant="outline" disabled className="text-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" />Delete firm</Button>
                                </span>
                            </Hint>
                        </div>
                    </section>
                </div>
            )}

            {tab === 'branding' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" role="tabpanel">
                    <PropertyList>
                        <PropertyRow label="Display name" icon={<User />}>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <Input defaultValue={firm.name} aria-label="Display name" className={PROPERTY_FIELD_CLASS} />
                                <p className={PROPERTY_HINT_CLASS}>Shown in the top bar</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label="Tagline" icon={<Type />}><Input placeholder="Empty" aria-label="Tagline" className={PROPERTY_FIELD_CLASS} /></PropertyRow>
                        <PropertyRow label="Brand color" icon={<Palette />}>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex items-center gap-2 px-2">
                                    <span className="h-5 w-5 shrink-0 rounded-control border border-line bg-action" aria-hidden />
                                    <span className="font-mono text-ui text-fg-muted">Firma default</span>
                                </div>
                                <p className={PROPERTY_HINT_CLASS}>Buttons, links and selected states. A light color is darkened to stay readable.</p>
                            </div>
                        </PropertyRow>
                        <PropertyRow label="Logo" icon={<Building2 />}>
                            <div className="flex items-center gap-2 px-2">
                                <FirmMark firm={{ name: firm.name, logoUrl: null }} />
                                <span className="text-caption text-fg-subtle">JPG, PNG or SVG. Max 5 MB.</span>
                            </div>
                        </PropertyRow>
                    </PropertyList>
                    <div><InertSave>Save branding</InertSave></div>
                </div>
            )}

            {tab === 'appsettings' && (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" role="tabpanel">
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Access</h3>
                        <SwitchRow icon={<Shield />} title={<>Let anyone at <span className="font-medium">{DOMAIN}</span> join</>} description="People with this email domain can join without an invitation." initial={true} />
                        <PropertyList className="mt-1">
                            <PropertyRow label="Email domain" icon={<AtSign />}><Input defaultValue={DOMAIN} aria-label="Email domain" className={cn('font-mono', PROPERTY_FIELD_CLASS)} /></PropertyRow>
                        </PropertyList>
                    </section>
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Regional</h3>
                        <PropertyList>
                            <PropertyRow label="Currency" icon={<DollarSign />}>
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="px-2 text-ui text-fg">$ US dollar</span>
                                    <p className={PROPERTY_HINT_CLASS}>Prefix on contract values</p>
                                </div>
                            </PropertyRow>
                        </PropertyList>
                    </section>
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Reminder emails</h3>
                        <SwitchRow icon={<Bell />} title="Immediate notification" description="Send an email when a reminder is created." initial={true} />
                        <SwitchRow icon={<RefreshCw />} title="Recurring emails" description="Send repeat reminder emails until marked done." initial={false} />
                        <SwitchRow icon={<MessagesSquare />} title="Email on @mention" description="Send an email when someone is @mentioned in a comment." initial={true} />
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
                                {EVENT_ROWS.map((row) => (
                                    <NotionTableRow key={row.label}>
                                        <NotionTableCell>{row.label}</NotionTableCell>
                                        <NotionTableCell className="text-center"><Switch defaultChecked={row.email} aria-label={`${row.label} — notify by email`} /></NotionTableCell>
                                        <NotionTableCell className="text-center"><Switch defaultChecked={row.inApp} aria-label={`${row.label} — in-app notification`} /></NotionTableCell>
                                    </NotionTableRow>
                                ))}
                            </NotionTableBody>
                        </NotionTable>
                    </section>
                    <section>
                        <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Overview for contributors and reviewers</h3>
                        <p className="mb-1 text-small text-fg-muted">Which sections external members see on an engagement&apos;s Overview. Internal members always see everything.</p>
                        <SwitchRow icon={<BarChart2 />} title="Engagement health" initial={true} />
                        <SwitchRow icon={<BarChart2 />} title="File organization" initial={false} />
                        <SwitchRow icon={<BarChart2 />} title="Document activity" initial={true} />
                    </section>
                    <div><InertSave /></div>
                </div>
            )}

            {tab === 'storage' && (
                <div className="mx-auto w-full max-w-2xl" role="tabpanel">
                    <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Document storage</h3>
                    <p className="mb-3 text-small text-fg-muted">Where the firm&apos;s client folders live. Firma works in your own Drive: files stay where they are, and Firma organizes and shares them.</p>
                    <div className="flex items-center gap-3 rounded-card border border-line p-3">
                        <GoogleDriveIcon size={20} />
                        <div className="min-w-0 flex-1">
                            <p className="text-ui font-medium text-fg">Google Drive</p>
                            <p className="truncate text-small text-fg-muted">Connected as files@{DOMAIN}</p>
                        </div>
                        <Hint label={NOT_IN_DEMO} side="top">
                            <span className="inline-flex"><Button type="button" variant="outline" size="sm" disabled>Manage</Button></span>
                        </Hint>
                    </div>
                </div>
            )}
        </div>
    )
}
