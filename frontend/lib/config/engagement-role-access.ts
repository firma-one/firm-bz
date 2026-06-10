/**
 * Role-based access for project features (in-code config for now;
 * will later move to permissions or project_personas table).
 */
export const PROJECT_ROLE_ACCESS = {
  /** Persona names (case-insensitive) that can view and use project settings. */
  canViewProjectSettings: ['Project Lead'],
} as const

export function canViewProjectSettingsByPersona(personaName: string | null | undefined): boolean {
  if (!personaName) return false
  const lower = personaName.toLowerCase()
  return PROJECT_ROLE_ACCESS.canViewProjectSettings.some(
    (name) => name.toLowerCase() === lower
  )
}
