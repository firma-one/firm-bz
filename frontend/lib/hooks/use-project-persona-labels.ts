'use client'

import { useState, useEffect } from 'react'
import { getProjectPersonas } from '@/lib/actions/personas'

const FALLBACK_EXT_COLLABORATOR = 'External Collaborator'
const FALLBACK_VIEWER = 'Reviewer'

export interface ProjectPersonaLabels {
  /** displayName for platform.personas.eng_ext_collaborator */
  projExtCollaborator: string
  /** displayName for platform.personas.eng_viewer */
  projViewer: string
}

/**
 * Fetches project personas from platform.personas and returns displayNames
 * for eng_ext_collaborator and eng_viewer. Use for dynamic labels in Share
 * modals, shares tab, and anywhere these persona names are shown.
 */
export function useProjectPersonaLabels(): ProjectPersonaLabels {
  const [labels, setLabels] = useState<ProjectPersonaLabels>({
    projExtCollaborator: FALLBACK_EXT_COLLABORATOR,
    projViewer: FALLBACK_VIEWER,
  })

  useEffect(() => {
    let cancelled = false
    getProjectPersonas()
      .then((personas) => {
        if (cancelled) return
        const bySlug: Record<string, string> = {}
        for (const p of personas as { slug: string; displayName: string }[]) {
          bySlug[p.slug] = p.displayName ?? p.slug
        }
        setLabels({
          projExtCollaborator: bySlug['eng_ext_collaborator'] ?? FALLBACK_EXT_COLLABORATOR,
          projViewer: bySlug['eng_viewer'] ?? FALLBACK_VIEWER,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setLabels({
            projExtCollaborator: FALLBACK_EXT_COLLABORATOR,
            projViewer: FALLBACK_VIEWER,
          })
        }
      })
    return () => { cancelled = true }
  }, [])

  return labels
}
