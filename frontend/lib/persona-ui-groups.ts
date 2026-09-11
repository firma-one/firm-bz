export type PersonaUiRole = 'owner' | 'contributor' | 'reviewer'
export type PersonaUiSubRole = 'internal' | 'external'

export const PERSONA_UI_GROUPS = {
    eng_admin: { uiRole: 'owner' as const, label: 'Owner' },
    eng_member: { uiRole: 'contributor' as const, subRole: 'internal' as const, label: 'Contributor', subLabel: 'Full Access' },
    eng_ext_collaborator: { uiRole: 'contributor' as const, subRole: 'external' as const, label: 'Contributor', subLabel: 'Limited Access' },
    eng_viewer: { uiRole: 'reviewer' as const, label: 'Reviewer' },
} as const

export const SUB_ROLE_LABEL: Record<PersonaUiSubRole, string> = {
    internal: 'Full Access',
    external: 'Limited Access',
}

export type PersonaUiSlug = keyof typeof PERSONA_UI_GROUPS

export function isPersonaUiSlug(slug: string): slug is PersonaUiSlug {
    return slug in PERSONA_UI_GROUPS
}

export function getPersonaUiGroup(slug: string) {
    return isPersonaUiSlug(slug) ? PERSONA_UI_GROUPS[slug] : undefined
}

/** For a given top-level UI role + optional sub-role, find the matching persona slug. */
export function resolvePersonaSlug(uiRole: PersonaUiRole, subRole?: PersonaUiSubRole): PersonaUiSlug | undefined {
    return (Object.keys(PERSONA_UI_GROUPS) as PersonaUiSlug[]).find((slug) => {
        const group = PERSONA_UI_GROUPS[slug]
        if (group.uiRole !== uiRole) return false
        if (group.uiRole === 'contributor') return group.subRole === subRole
        return true
    })
}
