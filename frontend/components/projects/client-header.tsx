"use client"

import { useRouter } from "next/navigation"
import { Briefcase, Building2, CalendarCheck, CalendarDays, Globe, Users } from "lucide-react"
import { format } from "date-fns"
import { updateClient, type LwCrmClientStatus } from "@/lib/actions/client"
import type { HierarchyClient } from "@/lib/actions/hierarchy"
import { StatusProperty } from "@/components/ui/property-cells"
import { HeaderProp as Prop } from "@/components/ui/header-prop"
import { Tag } from "@/components/ui/tag"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/toast"

const CLIENT_STATUSES: LwCrmClientStatus[] = ["PROSPECT", "ACTIVE", "ON_HOLD", "PAST"]

function day(value: Date | string | null): string | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : format(d, "MMM d, yyyy")
}

/**
 * Client page top block, Linear-style like the engagement header: name, description, then one
 * row of properties — status (editable inline by the client's managers), industry, website,
 * client since or expected close, engagement count and tags.
 */
export function ClientHeader({
    client,
    firmSlug,
    canManage,
}: {
    client: HierarchyClient
    firmSlug: string
    canManage: boolean
}) {
    const router = useRouter()
    const { addToast } = useToast()
    const status = (client.status as LwCrmClientStatus | null) ?? "ACTIVE"
    const isProspect = status === "PROSPECT"
    const since = day(client.clientSinceDate)
    const expectedClose = day(client.expectedCloseDate)
    const website = client.website?.trim()
    const websiteHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null
    const engagementCount = client.engagements.length

    async function saveStatus(next: string) {
        try {
            await updateClient(firmSlug, client.slug, { status: next as LwCrmClientStatus })
            router.refresh()
        } catch (e) {
            addToast({ type: "error", title: "Couldn't update status", message: e instanceof Error ? e.message : undefined })
            throw e
        }
    }

    return (
        <TooltipProvider delayDuration={300}>
            <header className="flex flex-col gap-2 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                    {/* The client's logo when it has one, else the app's client icon (as in PageHeading). */}
                    {client.brandLogoUrl ? (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface">
                            <img src={client.brandLogoUrl} alt="" className="h-full w-full object-contain p-1" />
                        </span>
                    ) : (
                        <span className="flex shrink-0 items-center text-fg-muted [&_svg]:h-7 [&_svg]:w-7" aria-hidden>
                            <Users />
                        </span>
                    )}
                    <h1 className="min-w-0 truncate text-h1 text-fg">{client.name}</h1>
                </div>
                {client.description && <p className="max-w-3xl text-ui text-fg-muted line-clamp-2">{client.description}</p>}

                <div className="-ml-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
                    <Prop label="Status">
                        <StatusProperty kind="client" value={status} options={CLIENT_STATUSES} disabled={!canManage} onChange={saveStatus} />
                    </Prop>

                    {client.industry && (
                        <Prop label="Industry" icon={<Building2 className="h-3.5 w-3.5" />}>
                            <span className="inline-flex h-7 items-center px-1.5 text-small text-fg">{client.industry}</span>
                        </Prop>
                    )}

                    {websiteHref && (
                        <Prop label="Website">
                            <a
                                href={websiteHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                            >
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{website!.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</span>
                            </a>
                        </Prop>
                    )}

                    {isProspect
                        ? expectedClose && (
                              <Prop label="Expected close" icon={<CalendarCheck className="h-3.5 w-3.5" />}>
                                  <span className="inline-flex h-7 items-center px-1.5 text-small tabular-nums text-fg">{expectedClose}</span>
                              </Prop>
                          )
                        : since && (
                              <Prop label="Client since" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                                  <span className="inline-flex h-7 items-center px-1.5 text-small tabular-nums text-fg">{since}</span>
                              </Prop>
                          )}

                    <Prop label="Engagements" icon={<Briefcase className="h-3.5 w-3.5" />}>
                        <span className="inline-flex h-7 items-center px-1.5 text-small tabular-nums text-fg">{engagementCount}</span>
                    </Prop>

                    {client.tags.length > 0 && (
                        <span className="ml-1 flex flex-wrap items-center gap-1">
                            {client.tags.slice(0, 4).map((t) => (
                                <Tag key={t} color="gray">{t}</Tag>
                            ))}
                            {client.tags.length > 4 && <span className="text-caption text-fg-subtle">+{client.tags.length - 4}</span>}
                        </span>
                    )}
                </div>
            </header>
        </TooltipProvider>
    )
}
