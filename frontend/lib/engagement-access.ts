import type { EngagementRole, EngagementStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSharedAndAncestorIdsForPersona, privateExternalIds } from '@/lib/engagement-sharing-ids'
import { userFacing } from '@/lib/actions/action-result'

export type EngagementMemberRow = {
  role: EngagementRole
}

/**
 * Engagement-scoped APIs (deeplinks, doc comments, resolve-path, secure re-grant) require
 * an explicit engagement_members row. Firm/client admins without membership do not receive
 * break-glass access here (they still may elsewhere via checkProjectPermission).
 */
export async function requireEngagementMember(
  projectId: string,
  userId: string
): Promise<EngagementMemberRow | null> {
  const member = await prisma.engagementMember.findFirst({
    where: { engagementId: projectId, userId },
    select: { role: true },
  })
  return member
}

export async function getEngagementStatus(projectId: string): Promise<EngagementStatus | null> {
  const e = await prisma.engagement.findFirst({
    where: { id: projectId, isDeleted: false },
    select: { status: true },
  })
  return e?.status ?? null
}

export function isExternalEngagementRole(role: EngagementRole | null | undefined): boolean {
  return role === 'eng_ext_collaborator' || role === 'eng_viewer'
}

/**
 * After closure every role is read-only for file mutations, in Firma and in Drive; leads still manage
 * lifecycle. Removing a member is what takes their access away altogether.
 */
export function isEngagementMemberReadOnlyWhenCompleted(
  status: EngagementStatus | null | undefined,
  role: EngagementRole | null | undefined
): boolean {
  return status === 'COMPLETED' && !!role
}

export function isEngagementLeadRole(role: EngagementRole | null | undefined): boolean {
  return role === 'eng_admin'
}

/** External personas may only access documents in the shared subtree (same rule as file-info). */
export async function externalMemberCanAccessDocument(
  projectId: string,
  persona: EngagementRole,
  documentExternalId: string
): Promise<boolean> {
  const visible = await visibleDocumentIdsFor(projectId, persona)
  return !visible || visible.has(documentExternalId)
}

/**
 * The documents a persona may access, by external ID: the shared subtree for external personas;
 * null for internal roles, who may access them all. For checking many documents at once.
 */
export async function visibleDocumentIdsFor(
  projectId: string,
  persona: EngagementRole
): Promise<Set<string> | null> {
  if (!isExternalEngagementRole(persona)) return null
  const slug = persona === 'eng_viewer' ? ('eng_viewer' as const) : ('eng_ext_collaborator' as const)
  const { sharedIds, descendantIds } = await getSharedAndAncestorIdsForPersona(projectId, slug, {
    skipDescendants: false,
  })
  return new Set([...sharedIds, ...descendantIds])
}

/**
 * A client never reaches what's private to the firm, even holding its ID. For routes that open a
 * document directly (secure open, preview, download), which otherwise check membership alone.
 */
export async function isHiddenFromMember(
  projectId: string,
  role: EngagementRole | null | undefined,
  documentExternalId: string
): Promise<boolean> {
  if (!isExternalEngagementRole(role)) return false
  return (await privateExternalIds(projectId)).has(documentExternalId)
}

const COMPLETED_MESSAGE = "This engagement is completed, so it's read only."
const completedRefusal = () => NextResponse.json({ error: COMPLETED_MESSAGE }, { status: 403 })

/**
 * A completed engagement is read only for everyone: every operation that writes to it refuses, not only
 * those on its files. Reading, opening and downloading go on, and so does what manages the engagement
 * itself: its status, which is how it's reopened, and its members, since removing one is how access is
 * taken away. So does anyone's own state, such as a bookmark or a comment marked read.
 *
 * The caller checks who's asking first, so someone with no access isn't told the status. The routes are
 * listed in lib/engagement-access.completed.test.ts, and a new one must take a side there.
 */
export async function blockIfEngagementCompleted(projectId: string): Promise<NextResponse | null> {
  return (await getEngagementStatus(projectId)) === 'COMPLETED' ? completedRefusal() : null
}

/** The same, for a server action: its words reach the person through asResult (lib/actions/action-result.ts). */
export async function assertEngagementNotCompleted(projectId: string): Promise<void> {
  if ((await getEngagementStatus(projectId)) === 'COMPLETED') throw userFacing(COMPLETED_MESSAGE, 'engagement_completed')
}

/** Blocks file mutations when user is not an engagement member or is read-only after closure. */
export async function blockIfEngagementFileMutationForbidden(
  userId: string,
  projectId: string | undefined
): Promise<NextResponse | null> {
  if (!projectId) return null
  const member = await requireEngagementMember(projectId, userId)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const status = await getEngagementStatus(projectId)
  return isEngagementMemberReadOnlyWhenCompleted(status, member.role) ? completedRefusal() : null
}
