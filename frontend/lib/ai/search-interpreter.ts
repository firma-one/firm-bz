import 'server-only'
import { getAnthropic, AI_MODEL } from './client'
import { logger } from '@/lib/logger'

export type FilterStage = 'client' | 'engagement' | 'deliverable' | 'dateRange' | 'type'

export const TIME_PRESETS = [
    'Overdue', 'Today', 'Last 7 days', 'Last 30 days', 'This Quarter', 'This Year',
] as const

export const FILE_TYPES = [
    'document', 'spreadsheet', 'presentation', 'image', 'audio', 'video', 'folder', 'any',
] as const

export interface PickerEntity {
    id: string
    name: string
    clientId?: string
    engagementId?: string
}

export interface InterpretCandidates {
    clients: PickerEntity[]
    engagements: PickerEntity[]
    deliverables: PickerEntity[]
}

export interface InferredChip {
    stage: FilterStage
    id: string
    name: string
}

export interface InterpretResult {
    chips: InferredChip[]
    /** The part of the query that is about content, passed to the existing search as `q`. */
    residualText: string
}

const SYSTEM = `You turn a professional-services search query into structured filters.

You are given the user's entire visible list of clients, engagements and deliverables. Resolve only
against that list — it is the complete set of things they can search.

Rules:
- Resolve an entity ONLY when the query clearly refers to one in the list. A rough match on a
  distinctive name is fine ("Acme" -> "Acme Corporation"). An ambiguous match between two similar
  names is NOT — resolve nothing rather than guess.
- Time expressions map to one of the fixed presets, never to explicit dates. If nothing in the list
  fits the phrase, omit the date filter.
- residualText is what remains after removing the parts you turned into filters — the words about
  document content. If the whole query became filters, residualText is an empty string.
- Prefer resolving nothing over resolving wrongly. A missing filter costs the user a wider result
  set; a wrong one hides the document they wanted.`

const TOOL = {
    name: 'apply_filters',
    description: 'Apply the filters implied by the search query.',
    input_schema: {
        type: 'object' as const,
        properties: {
            clientId: { type: 'string', description: 'id of a client from the list, if clearly referenced' },
            engagementId: { type: 'string', description: 'id of an engagement from the list, if clearly referenced' },
            deliverableId: { type: 'string', description: 'id of a deliverable from the list, if clearly referenced' },
            dateRange: { type: 'string', enum: [...TIME_PRESETS], description: 'a fixed time preset, if the query implies one' },
            fileTypes: {
                type: 'array',
                items: { type: 'string', enum: [...FILE_TYPES] },
                description: 'file type categories, if the query names one',
            },
            residualText: { type: 'string', description: 'the remaining content-related words' },
        },
        required: ['residualText'],
    },
}

/** Caps the candidate list sent to the model so a large firm cannot blow the context window. */
const MAX_PER_KIND = 150

function renderCandidates(c: InterpretCandidates): string {
    const clientName = new Map(c.clients.map((x) => [x.id, x.name]))
    const lines: string[] = ['CLIENTS:']
    for (const x of c.clients.slice(0, MAX_PER_KIND)) lines.push(`  ${x.id} :: ${x.name}`)
    lines.push('ENGAGEMENTS:')
    for (const x of c.engagements.slice(0, MAX_PER_KIND)) {
        lines.push(`  ${x.id} :: ${x.name}${x.clientId ? ` (client: ${clientName.get(x.clientId) ?? '?'})` : ''}`)
    }
    lines.push('DELIVERABLES:')
    for (const x of c.deliverables.slice(0, MAX_PER_KIND)) lines.push(`  ${x.id} :: ${x.name}`)
    return lines.join('\n')
}

/**
 * Resolves a prose query into filter chips.
 *
 * Every returned id is validated against the supplied candidate list, so a hallucinated id is
 * dropped rather than applied — the caller can trust that any chip it receives refers to something
 * the user can actually see. Returns null when AI is unavailable or the call fails, so the caller
 * falls back to a plain search.
 */
export async function interpretSearchQuery(
    text: string,
    candidates: InterpretCandidates,
): Promise<(InterpretResult & { usage: { inputTokens: number; outputTokens: number } }) | null> {
    const client = getAnthropic()
    if (!client) return null

    try {
        const message = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 400,
            temperature: 0,
            system: SYSTEM,
            tools: [TOOL],
            tool_choice: { type: 'tool', name: 'apply_filters' },
            messages: [{
                role: 'user',
                content: `${renderCandidates(candidates)}\n\nQUERY: ${text}`,
            }],
        })

        const call = message.content.find((b) => b.type === 'tool_use')
        if (!call || call.type !== 'tool_use') return null
        const args = call.input as Record<string, unknown>

        const chips: InferredChip[] = []
        const byId = (list: PickerEntity[], id: unknown) =>
            typeof id === 'string' ? list.find((e) => e.id === id) ?? null : null

        // Each id must exist in the candidate list the model was given; anything else is dropped.
        const c = byId(candidates.clients, args.clientId)
        if (c) chips.push({ stage: 'client', id: c.id, name: c.name })

        const e = byId(candidates.engagements, args.engagementId)
        if (e) chips.push({ stage: 'engagement', id: e.id, name: e.name })

        const d = byId(candidates.deliverables, args.deliverableId)
        if (d) chips.push({ stage: 'deliverable', id: d.id, name: d.name })

        const preset = args.dateRange
        if (typeof preset === 'string' && (TIME_PRESETS as readonly string[]).includes(preset)) {
            chips.push({ stage: 'dateRange', id: preset, name: preset })
        }

        const types = Array.isArray(args.fileTypes)
            ? args.fileTypes.filter((t): t is string =>
                typeof t === 'string' && (FILE_TYPES as readonly string[]).includes(t) && t !== 'any')
            : []
        if (types.length > 0) {
            chips.push({ stage: 'type', id: types.join(','), name: types.length === 1 ? types[0] : `${types.length} types` })
        }

        return {
            chips,
            residualText: typeof args.residualText === 'string' ? args.residualText.trim() : '',
            usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
            },
        }
    } catch (error) {
        logger.error('Search interpretation failed:', error as Error)
        return null
    }
}
