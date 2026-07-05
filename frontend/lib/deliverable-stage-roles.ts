import type { ActivityStatus } from '@/lib/sharing-settings'

export type EngagementRoleSlug = 'eng_admin' | 'eng_member' | 'eng_ext_collaborator' | 'eng_viewer'

interface StageRoleConfig {
  showTo: EngagementRoleSlug[] | 'all'
  ecEnabled: boolean
  evEnabled: boolean
}

export const STAGE_ROLE_MAP: Record<ActivityStatus, StageRoleConfig> = {
  to_do: {
    showTo: ['eng_admin', 'eng_member'],
    ecEnabled: false,
    evEnabled: false,
  },
  in_progress: {
    showTo: ['eng_admin', 'eng_member', 'eng_ext_collaborator'],
    ecEnabled: true,
    evEnabled: false,
  },
  in_review: {
    showTo: ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer'],
    ecEnabled: true,
    evEnabled: true,
  },
  approved: {
    showTo: 'all',
    ecEnabled: true,
    evEnabled: true,
  },
}

export function canViewDeliverable(role: EngagementRoleSlug, status: ActivityStatus): boolean {
  const config = STAGE_ROLE_MAP[status]
  if (config.showTo === 'all') return true
  return config.showTo.includes(role)
}

export function canApproveDeliverable(role: EngagementRoleSlug): boolean {
  return role === 'eng_admin'
}

const STAGE_ORDER: Record<ActivityStatus, number> = { to_do: 0, in_progress: 1, in_review: 2, approved: 3 }

/**
 * Returns the set of target statuses a role may move a deliverable to from `currentStatus`.
 * This is the single source of truth used by both the board drag-and-drop and the detail panel.
 */
export function getAllowedTransitions(role: EngagementRoleSlug, currentStatus: ActivityStatus): ActivityStatus[] {
  if (currentStatus === 'approved') return [] // nothing can move back from approved

  const currentIdx = STAGE_ORDER[currentStatus]
  const allStatuses: ActivityStatus[] = ['to_do', 'in_progress', 'in_review', 'approved']

  return allStatuses.filter((target) => {
    if (target === currentStatus) return false
    const targetIdx = STAGE_ORDER[target]
    if (Math.abs(targetIdx - currentIdx) > 1) return false // only ±1 step

    switch (role) {
      case 'eng_admin':
        // EL can move anywhere (±1), including approve
        return true
      case 'eng_member':
        // EM can move forward to in_review only (in_progress → in_review)
        // and back (in_review → in_progress). Cannot approve.
        return target !== 'approved'
      case 'eng_ext_collaborator':
        // EC can only submit for review: in_progress → in_review
        return currentStatus === 'in_progress' && target === 'in_review'
      case 'eng_viewer':
        // EV can only push back: in_review → in_progress
        return currentStatus === 'in_review' && target === 'in_progress'
      default:
        return false
    }
  })
}
