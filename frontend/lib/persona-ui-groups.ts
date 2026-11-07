export type PersonaUiRole = 'owner' | 'contributor' | 'reviewer'
export type PersonaUiSubRole = 'internal' | 'external'

export const PERSONA_UI_GROUPS = {
    eng_admin: { uiRole: 'owner' as const, label: 'Lead' },
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

/**
 * The one set of role names, for everything people see (.claude/plans/role-names.md). The database's
 * persona names are left alone and aren't shown: some permission checks compare them.
 *
 * Named by access, not by who holds the role: someone inside the firm can be a Reviewer, so a role is
 * never "external", "guest" or "client" on screen. "Internal" means Leads and Full Access contributors.
 */
export const ROLE_NAME: Record<PersonaUiSlug, string> = {
    eng_admin: 'Lead',
    eng_member: 'Contributor · Full Access',
    eng_ext_collaborator: 'Contributor · Limited Access',
    eng_viewer: 'Reviewer',
}

/** The same roles where space is tight: chart legends, the mention menu. */
export const ROLE_SHORT_NAME: Record<PersonaUiSlug, string> = {
    eng_admin: 'Lead',
    eng_member: 'Full Access',
    eng_ext_collaborator: 'Limited Access',
    eng_viewer: 'Reviewer',
}

/** What each role can do, for the Members page and the invite dialog. */
export const ROLE_DESCRIPTION: Record<PersonaUiSlug, string> = {
    eng_admin: 'Manages the engagement, its members and its content.',
    eng_member: 'Can see and edit all engagement content.',
    eng_ext_collaborator: 'Can edit only what is shared with them. Internal only content stays hidden.',
    eng_viewer: 'Can view only what is shared with them. Read-only.',
}

export function roleDescription(slug: string | null | undefined): string | undefined {
    return slug && isPersonaUiSlug(slug) ? ROLE_DESCRIPTION[slug] : undefined
}
