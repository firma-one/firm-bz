import type { EngagementRole, EngagementStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSharedAndAncestorIdsForPersona } from '@/lib/project-sharing-ids'

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

/** After closure: internal contributors are read-only in product + Drive; leads keep manage/edit. */
export function isEngagementMemberReadOnlyWhenCompleted(
  status: EngagementStatus | null | undefined,
  role: EngagementRole | null | undefined
): boolean {
  return status === 'COMPLETED' && role === 'eng_member'
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
  if (!isExternalEngagementRole(persona)) return true
  const slug = persona === 'eng_viewer' ? ('eng_viewer' as const) : ('eng_ext_collaborator' as const)
  const { sharedIds, descendantIds } = await getSharedAndAncestorIdsForPersona(projectId, slug, {
    skipDescendants: false,
  })
  return sharedIds.includes(documentExternalId) || descendantIds.includes(documentExternalId)
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
  if (isEngagementMemberReadOnlyWhenCompleted(status, member.role)) {
    return NextResponse.json(
      { error: 'This engagement is closed. File changes are not allowed for your role.' },
      { status: 403 }
    )
  }
  return null
}
