import 'server-only'
import { AI_MODEL } from '@/lib/ai/client'
import { getGuardedAnthropic, meterAiCall, type AiScope } from '@/lib/ai/guarded-client'
import { logger } from '@/lib/logger'
import { type AnalysisSummary, type FileNode, type Finding } from './analyze'
import { assessOrganization, assessmentMarkdown, renderAssessment } from './assess'
import { TOOLS, validateProposals, type Proposal } from './tools'
import { RunBudget, MAX_AGENT_TURNS } from './budget'

/**
 * One review run: analyze deterministically, then ask the model to propose fixes.
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

/**
 * What good looks like, stated explicitly.
 *
 * The rules below are the firm's filing conventions written down. They exist in the prompt rather
 * than in the detectors because they are JUDGEMENTS — "a deliverable folder should carry the
 * deliverable's number" is a convention, not a fact, and a firm may reasonably disagree. The
 * detectors find what is measurably inconsistent; these rules decide what consistent should mean.
 */
const ORGANIZATION_RULES = `FILING CONVENTIONS (what good looks like)

Naming — the name alone should say what the file is, to someone who was not there.
- ONE separator per folder. Hyphens or underscores, consistently; never a mix. Spaces are allowed
  but weakest: they break links and command-line tools, and sort unpredictably across clients.
- Follow the folder's existing separator even when it is not your preference. Consistency is the
  property that matters; the choice between "-" and "_" is not.
- Sequence prefixes where there is a reading order: "01-", "02-". Two digits, so "10" sorts after
  "09". Number by reading order, not by creation date.
- NEVER remove an existing sequence prefix. A file named "01-Content-Archive.docx" in a folder that
  uses underscores becomes "01_Content_Archive.docx", not "content_archive.docx" — the number is
  someone's ordering, and dropping it loses information no convention asked you to discard.
- Say what it IS, not what it is called generically. "Report.docx", "Document.docx", "Final.xlsx",
  "Untitled" and "New folder" name nothing and are worth renaming on sight.
- Keep names recognizable to the person who made them. A name nobody recognizes is worse than an
  inconsistent one: never replace a meaningful name with a generic numbered one.
- Preserve acronyms exactly as written: GTM, SOW, NDA, Q3, EBITDA.
- Dates as ISO, and only where the date identifies the document: "2026-03-15-Board-Pack". Never
  "March 15" or "15-03-26" — they sort wrongly and read differently by country.
- Version by meaning: "-v2", "-v3", or a date. Never "final", "FINAL", "final-v2", "latest" — the
  word stops being true the moment it is written.
- No copy suffixes: "(1)", "(2)", "copy", "copy 2" are download accidents, not names. The file that
  carries one is usually the duplicate; the clean name is usually the original.
- No personal initials, no "my", no dates of convenience in a shared name. The folder says whose it
  is and when it was made.
- Keep the extension untouched. Renaming .docx to .pdf converts nothing — it only makes the file
  open wrongly.

Structure — a folder tree is a table of contents, not a filing cabinet.
- Nothing loose at the engagement root once folders exist. A file sitting beside the folders is a
  file nobody has decided about, and it is the first thing a new joiner trips over.
- Deliverable folders mirror the engagement's deliverables, numbered to match them.
- Client-facing and internal work separate at the top level. Someone given the wrong link should
  still not reach internal material.
- Source data and working papers belong with the deliverable they support, or in one folder of
  their own — never scattered beside finished work.
- Review stages ("Draft", "In Review", "Final") nest INSIDE the deliverable folder. At the top
  level they say nothing about what is in draft.
- Depth of three to four levels. Deeper and people stop navigating and start searching.
- A folder holding more than about twenty-five loose files wants subfolders.
- No empty folder left behind, and no folder holding a single file for its whole life.
- Related files stay together. Splitting a deliverable's working file from its output across two
  branches costs more than either folder saves.

Judgement — when the rules disagree with the engagement, the engagement wins.
- Never propose a change whose only justification is taste. Every rename must fix something a
  person would recognize as wrong.
- Prefer the smallest change that resolves the finding. Renaming one outlier beats restyling forty
  files that are merely not to your preference.
- When in doubt, leave it. An unflagged file costs nothing; a wrong rename costs the lead their
  trust in every later proposal.`

const SYSTEM = `You help a professional services firm tidy an engagement's files.

You are given FINDINGS computed from the file tree, and the FILE LIST they refer to. Your job is to
propose concrete fixes using the tools provided. You do not decide whether to apply them — an
Engagement Lead reviews every proposal before anything changes.

${ORGANIZATION_RULES}

Rules:
0. You have exactly three tools: rename, move, create folder. You cannot delete, trash, archive,
   unshare or remove anything, and must never propose a change whose effect is to lose a file or
   its contents. Every operation you propose must be reversible. If the tidiest answer to a finding
   would be to delete something, propose nothing for it and leave it to the lead.
1. Only ever reference ids that appear in the FILE LIST. Never invent one.
2. Keep every file's extension exactly as it is. You are renaming files, not converting them.
3. The engagement's OWN convention wins over the conventions above. If a finding names a dominant
   pattern, propose names in that pattern even where the conventions would suggest another — a
   firm that has standardised on underscores is not wrong, and churning fifty files to match a
   preference is not a fix. Apply the conventions only where no local pattern exists.
4. Preserve meaning. "Q3 interviews raw.docx" becomes "05-Q3-Interviews-Raw.docx", never
   "05-Document.docx". A name nobody recognizes is worse than an inconsistent one.
5. Propose nothing you are unsure about. A smaller set of obviously right changes is worth more
   than a complete set the lead has to audit line by line.
6. Do not propose moving or renaming anything a finding did not raise.
7. Reasons are one short clause, written for the lead: "matches 01-Scope-Note pattern", not
   "improves file organization and discoverability".`

/** Caps how much tree goes into the prompt. Beyond this the findings matter, not every file. */
const MAX_FILES_IN_PROMPT = 400

function renderFindings(findings: Finding[]): string {
    return findings.map((f, i) => {
        const files = f.nodes.map((n) => `${n.externalId} "${n.fileName}"`).join(', ')
        // ONLY the separator, which is what the detector actually measured across the folder.
        //
        // The casing and numbered-prefix flags belong to whichever file landed in the group first,
        // so stating them passed one file's traits off as the folder's convention. Told "no number
        // prefix", the model stripped the "01-" from "01-Content-Archive.docx" — destroying a
        // deliberate sequence prefix to satisfy a pattern no one had chosen.
        const pattern = f.dominantPattern
            ? ` The folder's convention is "${f.dominantPattern.separator}" as the separator.`
                + ' Change ONLY the separator and the casing around it; keep any sequence prefix,'
                + ' dates and words exactly as they are.'
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
    /** What the tree looks like — reported whether or not anything is wrong. */
    summary: AnalysisSummary
    /** The same assessment as Markdown, for the chat to render in the ordinary message flow. */
    summaryMarkdown: string
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
    // One assessment, shared with the Overview score — see assess.ts. The model is GIVEN it rather
    // than offered a tool to fetch it: there is nothing to decide about whether to assess a tree
    // the user just asked to have assessed.
    const assessment = assessOrganization(params.nodes, params.rootId)
    const { findings, nodeCount, summary } = assessment.analysis

    // Nothing wrong: return before spending anything. A review that finds nothing should cost
    // nothing, or the feature teaches people not to run it.
    if (findings.length === 0) {
        return {
            findings: [], proposals: [], dropped: 0, turnsUsed: 0, creditsSpent: 0,
            truncated: false, summary, summaryMarkdown: assessmentMarkdown(assessment),
        }
    }

    const client = await getGuardedAnthropic(params.scope)
    if (!client) return null

    const budget = new RunBudget(MAX_AGENT_TURNS)
    const proposals: Proposal[] = []
    let dropped = 0

    const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [{
        role: 'user',
        content: `${renderAssessment(assessment)}\n\n`
            + `FINDINGS\n${renderFindings(findings)}\n\n`
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
        summary,
        summaryMarkdown: assessmentMarkdown(assessment),
    }
}
