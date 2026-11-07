import { ROLE_NAME } from '@/lib/persona-ui-groups'

export interface ProjectPersonaLabels {
  projExtCollaborator: string
  projViewer: string
}

const LABELS: ProjectPersonaLabels = {
  projExtCollaborator: ROLE_NAME.eng_ext_collaborator,
  projViewer: ROLE_NAME.eng_viewer,
}

/** The names of the two limited roles, for Share modals, the shares tab and anywhere else they're shown. */
export function useProjectPersonaLabels(): ProjectPersonaLabels {
  return LABELS
}
