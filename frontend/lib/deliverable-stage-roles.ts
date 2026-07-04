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
  return role === 'eng_admin' || role === 'eng_viewer'
}
