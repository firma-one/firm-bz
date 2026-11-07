import { describe, it, expect } from 'vitest'
import { PERSONA_UI_GROUPS, ROLE_DESCRIPTION, ROLE_NAME, ROLE_SHORT_NAME, roleDescription, type PersonaUiSlug } from './persona-ui-groups'

// The one set of role names. Named by access, not by who holds the role: someone inside the firm can
// be a Reviewer, so no role is "external", "guest" or "client" on screen.

const SLUGS = Object.keys(PERSONA_UI_GROUPS) as PersonaUiSlug[]

describe('role names', () => {
    it('gives the Members page and everything else the same names', () => {
        for (const slug of SLUGS) {
            const group = PERSONA_UI_GROUPS[slug]
            expect(ROLE_NAME[slug]).toBe('subLabel' in group ? `${group.label} · ${group.subLabel}` : group.label)
        }
    })

    it('has a name, a short name and a description for every role', () => {
        for (const slug of SLUGS) {
            expect(ROLE_NAME[slug]).toBeTruthy()
            expect(ROLE_SHORT_NAME[slug]).toBeTruthy()
            expect(roleDescription(slug)).toBe(ROLE_DESCRIPTION[slug])
        }
    })

    it.each(['external', 'guest', 'client', 'owner', 'viewer'])('never calls a role "%s"', (word) => {
        const shown = SLUGS.flatMap((slug) => [ROLE_NAME[slug], ROLE_SHORT_NAME[slug], ROLE_DESCRIPTION[slug]]).join(' ')
        expect(shown).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'))
    })

    it('has no description for anything else', () => {
        expect(roleDescription('firm_admin')).toBeUndefined()
        expect(roleDescription(undefined)).toBeUndefined()
    })
})
