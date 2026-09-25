import 'server-only'
import { getAnthropic, AI_MODEL } from './client'
import { logger } from '@/lib/logger'
import { resolvePeriod } from '@/lib/search/period'

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

/**
 * A client the model nearly chose instead. Surfaced to the user as a one-click switch rather than
 * a blocking question — the search still runs with the chosen one.
 */
export interface AmbiguousAlternative {
    stage: FilterStage
    chosenId: string
    alternativeId: string
    alternativeName: string
}

export interface InterpretResult {
    chips: InferredChip[]
    /** Set when the model resolved an entity but a similarly-named one was a close second. */
    ambiguity?: AmbiguousAlternative
    /** The part of the query that is about content, passed to the existing search as `q`. */
    residualText: string
}

const SYSTEM = `You turn a professional-services search query into structured filters.

You are given the user's entire visible list of clients, engagements and deliverables. Resolve only
against that list — it is the complete set of things they can search.

Rules:
- Resolve an entity ONLY when the query clearly refers to one in the list. A rough match on a
  distinctive name is fine ("Acme" -> "Acme Corporation").
- When two clients match similarly well ("Acme" against both "Acme Corp" and "Acme Industries"),
  pick the closer one AND set ambiguousClientId to the other. Do not silently drop both: the user
  is shown the alternative and can switch in one click, which beats returning nothing.
- Time expressions map to one of the fixed presets, never to explicit dates. If nothing in the list
  fits the phrase, omit the date filter.
- A specific calendar period goes in the "period" field, NOT "dateRange". Format: "Q1 2026", "H2 2025" or
  "2024" — a quarter or half MUST carry its year. Today's date is given below; use it to resolve
  relative phrasing ("last quarter", "this quarter", "last year") into an explicit period.
- NEVER resolve a period as an entity. "Q1", "Q2", "H2", "2024" are periods, not names. Do not set
  an engagement, client or deliverable id because its NAME happens to contain the same token.
  Example: "DataSentry playbooks from Q2" with an engagement named "Q2 Go-To-Market Positioning"
  -> client DataSentry, period "Q2 <current year>", NO engagement.
- If a period is too vague to pin to a quarter, half or year ("last spring", "a while back"),
  set neither field and leave the words in residualText.
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
            period: {
                type: 'string',
                description: 'a specific calendar period as "Q1 2026", "H2 2025" or "2024" (a quarter or half must include the year); use instead of dateRange when the query names a specific period',
            },
            ambiguousClientId: {
                type: 'string',
                description: 'id of a client that matched almost as well as clientId, if the reference was genuinely ambiguous',
            },
            residualText: { type: 'string', description: 'the remaining content-related words' },
        },
        required: ['residualText'],
    },
}

/**
 * Period expressions the available presets cannot represent: bare quarters, half-years and bare
 * years. `TIME_PRESETS` has nothing finer than "This Quarter", so a query naming a *specific*
 * period carries no date filter at all.
 *
 * The risk that creates is resolving the period as an ENTITY instead — a firm with an engagement
 * called "Q2 Go-To-Market Positioning" would otherwise have "from Q2" silently become an
 * engagement filter, which is a different search from the one the user asked for and hides
 * everything outside that engagement. The prompt forbids it; this enforces it, in the same spirit
 * as validating every id against the candidate list rather than trusting the model.
 */
const PERIOD_TOKEN = /\b(q[1-4]|h[12]|fy\s?\d{2,4}|20\d{2})\b/i

/**
 * True when the query mentions a specific period and the entity's name owes its match to that
 * period token — i.e. stripping the token leaves nothing of the name to match on.
 */
function resolvedFromPeriodToken(entityName: string, queryText: string): boolean {
    const queryPeriods = queryText.match(new RegExp(PERIOD_TOKEN, 'gi'))
    if (!queryPeriods) return false
    const nameLower = entityName.toLowerCase()
    return queryPeriods.some((period) => {
        const p = period.toLowerCase()
        if (!nameLower.includes(p)) return false
        // The name carries the period token. Does the rest of the name appear in the query at all?
        // If the query says "Q2 Go-To-Market" the match is real; if it only says "from Q2", it is
        // the token alone doing the work.
        const rest = nameLower.split(p).join(' ').split(/[^a-z0-9]+/).filter((w) => w.length > 2)
        const q = queryText.toLowerCase()
        return !rest.some((w) => q.includes(w))
    })
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
                content: `TODAY: ${new Date().toISOString().slice(0, 10)}\n\n${renderCandidates(candidates)}\n\nQUERY: ${text}`,
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

        // The runner-up is validated against the candidate list exactly like the chosen one, and
        // only kept when it is a genuinely different entity.
        const alt = byId(candidates.clients, args.ambiguousClientId)
        const ambiguity: AmbiguousAlternative | undefined = c && alt && alt.id !== c.id
            ? { stage: 'client', chosenId: c.id, alternativeId: alt.id, alternativeName: alt.name }
            : undefined

        const e = byId(candidates.engagements, args.engagementId)
        if (e && !resolvedFromPeriodToken(e.name, text)) {
            chips.push({ stage: 'engagement', id: e.id, name: e.name })
        } else if (e) {
            logger.info(`Dropped engagement "${e.name}": resolved only from a period token in "${text}"`)
        }

        const d = byId(candidates.deliverables, args.deliverableId)
        if (d && !resolvedFromPeriodToken(d.name, text)) {
            chips.push({ stage: 'deliverable', id: d.id, name: d.name })
        } else if (d) {
            logger.info(`Dropped deliverable "${d.name}": resolved only from a period token in "${text}"`)
        }

        // An absolute period wins over a relative preset: it is strictly more specific, and a
        // model that emits both is describing the same intent twice.
        const periodToken = typeof args.period === 'string' ? args.period : ''
        const period = periodToken ? resolvePeriod(periodToken) : null
        if (period) {
            // The id carries the canonical token, not a date — resolution stays in one place and
            // the chip round-trips through the URL without a serialised range.
            chips.push({ stage: 'dateRange', id: period.label, name: period.label })
        } else {
            if (periodToken) logger.info(`Dropped unresolvable period "${periodToken}" from "${text}"`)
            const preset = args.dateRange
            if (typeof preset === 'string' && (TIME_PRESETS as readonly string[]).includes(preset)) {
                chips.push({ stage: 'dateRange', id: preset, name: preset })
            }
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
            ambiguity,
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
