import demoHierarchyJson from './demo-firm-data.json'

export interface DemoFile {
    id: string
    docId: string
    name: string
    type: string
    modifiedTime: string
    size: number
}

export interface DemoFolder {
    id: string
    docId: string
    name: string
    files: DemoFile[]
    subfolders: DemoFolder[]
}

export interface DemoEngagement {
    slug: string
    name: string
    contractType?: string
    dueDate?: string
    rateOrValue?: string
    folders: DemoFolder[]
}

export interface DemoClient {
    slug: string
    name: string
    status?: string
    clientSinceDate?: string
    followUpDate?: string
    industry?: string
    engagements: DemoEngagement[]
}

export interface DemoFirm {
    name: string
    clients: DemoClient[]
}

interface RawSampleFile { name: string; type: string }
interface RawSampleFolder { name: string; files?: RawSampleFile[]; subfolders?: RawSampleFolder[] }
interface RawEngagement {
    name: string
    contractType?: string
    dueDate?: string
    rateOrValue?: string
    structure: Record<string, RawSampleFolder>
}
interface RawClient {
    clientName: string
    status?: string
    clientSinceDate?: string
    followUpDate?: string
    industry?: string
    engagements: RawEngagement[]
}
interface RawDemoConfig {
    firmName: string
    clients: RawClient[]
}

const rawConfig = demoHierarchyJson as unknown as RawDemoConfig

/** Deterministic, readable, URL-safe slug — stable across builds (no random suffix, unlike lib/slug-utils.ts). */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/** Resolves relative date tokens like "today+12" / "today-5" to an ISO date (YYYY-MM-DD). */
function resolveRelativeDate(value: string | undefined): string | undefined {
    if (!value) return value
    const m = value.match(/^today([+-]\d+)?$/)
    if (!m) return value
    const offset = m[1] ? parseInt(m[1], 10) : 0
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
}

let fileCounter = 0
let folderCounter = 0

/** Short doc-id prefix from an engagement name — e.g. "CMO Advisory & Leadership" -> "CAL", matches the real app's per-engagement docId convention (e.g. "GLP-4"). */
function docIdPrefix(engagementName: string): string {
    const letters = engagementName.match(/[A-Za-z]+/g) ?? []
    const initials = letters.map((w) => w[0]).join('').toUpperCase()
    return (initials.slice(0, 3) || 'DOC')
}

function buildFile(raw: RawSampleFile, docPrefix: string, docNumber: number): DemoFile {
    fileCounter += 1
    return {
        id: `demo-file-${fileCounter}`,
        docId: `${docPrefix}-${docNumber}`,
        name: raw.name,
        type: raw.type,
        modifiedTime: new Date(Date.now() - fileCounter * 86400000).toISOString(),
        size: (fileCounter % 9 + 1) * 128 * 1024,
    }
}

function buildFolder(raw: RawSampleFolder, docPrefix: string, docNumberRef: { n: number }): DemoFolder {
    folderCounter += 1
    return {
        id: `demo-folder-${folderCounter}`,
        docId: `${docPrefix}-${++docNumberRef.n}`,
        name: raw.name,
        files: (raw.files ?? []).map((f) => buildFile(f, docPrefix, ++docNumberRef.n)),
        subfolders: (raw.subfolders ?? []).map((f) => buildFolder(f, docPrefix, docNumberRef)),
    }
}

function buildEngagement(raw: RawEngagement): DemoEngagement {
    const docPrefix = docIdPrefix(raw.name)
    const docNumberRef = { n: 0 }
    return {
        slug: slugify(raw.name),
        name: raw.name,
        contractType: raw.contractType,
        dueDate: resolveRelativeDate(raw.dueDate),
        rateOrValue: raw.rateOrValue,
        folders: Object.values(raw.structure).map((f) => buildFolder(f, docPrefix, docNumberRef)),
    }
}

function buildClient(raw: RawClient): DemoClient {
    return {
        slug: slugify(raw.clientName),
        name: raw.clientName,
        status: raw.status,
        clientSinceDate: raw.clientSinceDate,
        followUpDate: resolveRelativeDate(raw.followUpDate),
        industry: raw.industry,
        engagements: raw.engagements.map(buildEngagement),
    }
}

/** Static demo firm data, derived once at module load from demo-firm-data.json. No DB, no network. */
export const DEMO_FIRM: DemoFirm = {
    name: rawConfig.firmName,
    clients: rawConfig.clients.map(buildClient),
}

export function getDemoClient(clientSlug: string): DemoClient | undefined {
    return DEMO_FIRM.clients.find((c) => c.slug === clientSlug)
}

export function getDemoEngagement(clientSlug: string, engagementSlug: string): { client: DemoClient; engagement: DemoEngagement } | undefined {
    const client = getDemoClient(clientSlug)
    if (!client) return undefined
    const engagement = client.engagements.find((e) => e.slug === engagementSlug)
    if (!engagement) return undefined
    return { client, engagement }
}

export function countFilesInFolder(folder: DemoFolder): number {
    return folder.files.length + folder.subfolders.reduce((sum, f) => sum + countFilesInFolder(f), 0)
}

export function countFilesInEngagement(engagement: DemoEngagement): number {
    return engagement.folders.reduce((sum, f) => sum + countFilesInFolder(f), 0)
}
