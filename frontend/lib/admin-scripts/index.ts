export interface ModelSummary {
  processed: number
  skipped: number
  errors: number
}

export interface ScriptResult {
  script: string
  status: 'success' | 'error'
  summary: Record<string, ModelSummary>
  durationMs: number
  error?: string
}

export interface AdminScript {
  id: string
  name: string
  description: string
  run: () => Promise<ScriptResult>
}

export const adminScripts: AdminScript[] = [
  {
    id: 'encrypt-backfill',
    name: 'Encryption Backfill',
    description:
      'Encrypts all plaintext values for newly-added encrypted fields ' +
      '(client, engagement, clientContact, docCommentMessage, connector). ' +
      'Skips rows that are already encrypted. Safe to run multiple times.',
    run: () => import('./encrypt-backfill').then((m) => m.run()),
  },
]

export function findScript(id: string): AdminScript | undefined {
  return adminScripts.find((s) => s.id === id)
}
