import 'server-only'
import { AI_MODEL } from '@/lib/ai/client'
import { getGuardedAnthropic, meterAiCall, type AiScope } from '@/lib/ai/guarded-client'
import { logger } from '@/lib/logger'
import { analyseFiles, type FileNode, type Finding } from './analyse'
import { TOOLS, validateProposals, type Proposal } from './tools'
import { RunBudget, MAX_AGENT_TURNS } from './budget'

/**
 * One review run: analyse deterministically, then ask the model to propose fixes.
 *
 * ## The loop is deliberately shallow
 *
 * This is not an open-ended agent. The findings are computed before the model is involved, so the
 * model is never exploring — it receives a bounded problem and answers it. In practice that is one
 * turn; the loop exists because a large tree may need the proposals split across calls, not
 * because the model is deciding what to do next.
 *
 * Keeping it shallow is what makes the cost predictable enough to show the user a number up front.
 */

const SYSTEM = `You help a professional services firm tidy an engagement's files.

You are given FINDINGS computed from the file tree, and the FILE LIST they refer to. Your job is to
propose concrete fixes using the tools provided. You do not decide whether to apply them — an
Engagement Lead reviews every proposal before anything changes.

Rules:
1. Only ever reference ids that appear in the FILE LIST. Never invent one.
2. Keep every file's extension exactly as it is. You are renaming files, not converting them.
3. Follow the dominant pattern a finding names. If files are "01-Scope-Note.docx" style, propose
   names in that style — numbered prefix, hyphens, title case.
4. Preserve meaning. "Q3 interviews raw.docx" becomes "05-Q3-Interviews-Raw.docx", never
   "05-Document.docx". A name nobody recognises is worse than an inconsistent one.
5. Propose nothing you are unsure about. A smaller set of obviously right changes is worth more
   than a complete set the lead has to audit line by line.
6. Do not propose moving or renaming anything a finding did not raise.
7. Reasons are one short clause, written for the lead: "matches 01-Scope-Note pattern", not
   "improves file organisation and discoverability".`

/** Caps how much tree goes into the prompt. Beyond this the findings matter, not every file. */
const MAX_FILES_IN_PROMPT = 400

function renderFindings(findings: Finding[]): string {
    return findings.map((f, i) => {
        const files = f.nodes.map((n) => `${n.externalId} "${n.fileName}"`).join(', ')
        const pattern = f.dominantPattern
            ? ` Dominant pattern: separator "${f.dominantPattern.separator}", `
                + `${f.dominantPattern.numberedPrefix ? 'numbered prefix' : 'no number prefix'}, `
                + `${f.dominantPattern.casing} case.`
            : ''
        return `${i + 1}. [${f.kind}]${pattern}\n   Affects: ${files}`
    }).join('\n')
}

function renderFiles(nodes: FileNode[]): string {
    return nodes.slice(0, MAX_FILES_IN_PROMPT).map((n) =>
        `${n.externalId}\t${n.isFolder ? 'FOLDER' : 'file'}\tparent=${n.parentId ?? 'root'}\t"${n.fileName}"`,
    ).join('\n')
}

export interface RunResult {
    findings: Finding[]
    proposals: Proposal[]
    /** Proposals the model returned that failed validation — surfaced so silence is explicable. */
    dropped: number
    turnsUsed: number
    creditsSpent: number
    /** True when the turn cap stopped the run rather than the model finishing. */
    truncated: boolean
}

/**
 * Runs a review. Returns proposals for human approval; mutates nothing.
 *
 * Meters every turn, including ones that produce nothing usable — the tokens were spent either
 * way, and not recording them would let a failing run consume inference invisibly, the same hole
 * the chat route closes for client disconnects.
 */
export async function runFilesReview(params: {
    nodes: FileNode[]
    rootId: string | null
    scope: AiScope
}): Promise<RunResult | null> {
    const { findings, nodeCount } = analyseFiles(params.nodes, params.rootId)

    // Nothing wrong: return before spending anything. A review that finds nothing should cost
    // nothing, or the feature teaches people not to run it.
    if (findings.length === 0) {
        return { findings: [], proposals: [], dropped: 0, turnsUsed: 0, creditsSpent: 0, truncated: false }
    }

    const client = await getGuardedAnthropic(params.scope)
    if (!client) return null

    const budget = new RunBudget(MAX_AGENT_TURNS)
    const proposals: Proposal[] = []
    let dropped = 0

    const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [{
        role: 'user',
        content: `FINDINGS\n${renderFindings(findings)}\n\n`
            + `FILE LIST (${nodeCount} items${nodeCount > MAX_FILES_IN_PROMPT ? `, first ${MAX_FILES_IN_PROMPT} shown` : ''})\n`
            + `${renderFiles(params.nodes)}\n\n`
            + 'Propose fixes for the findings above using the tools.',
    }]

    while (budget.canContinue()) {
        let message
        try {
            message = await client.messages.create({
                model: AI_MODEL,
                max_tokens: 2000,
                temperature: 0,
                system: SYSTEM,
                tools: TOOLS as any,
                messages,
            })
        } catch (error) {
            logger.error('Files agent turn failed:', error as Error)
            break
        }

        budget.recordTurn()
        await meterAiCall(params.scope, {
            inputTokens: (message.usage?.input_tokens ?? 0)
                + (message.usage?.cache_creation_input_tokens ?? 0)
                + (message.usage?.cache_read_input_tokens ?? 0),
            outputTokens: message.usage?.output_tokens ?? 0,
        })

        const toolCalls = message.content.filter((b) => b.type === 'tool_use')
        if (toolCalls.length === 0) break

        for (const call of toolCalls) {
            if (call.type !== 'tool_use') continue
            const result = validateProposals(call.name, call.input, params.nodes)
            proposals.push(...result.proposals)
            dropped += result.dropped
        }

        // The model has answered; there is no further state for it to discover. Ending the turn
        // here rather than feeding tool results back is what keeps this bounded — a tool-result
        // turn would invite it to keep proposing, which is exactly the open-ended shape this
        // deliberately is not.
        if (message.stop_reason !== 'max_tokens') break

        // Only when output was truncated mid-batch is another turn warranted.
        messages.push({ role: 'assistant', content: message.content })
        messages.push({ role: 'user', content: 'Continue with any remaining proposals.' })
    }

    return {
        findings,
        proposals,
        dropped,
        turnsUsed: budget.turns,
        creditsSpent: budget.creditsSpent,
        truncated: budget.exhausted,
    }
}
