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
  {
    id: 'onedrive-guest-backfill',
    name: 'OneDrive Guest Pre-Invite Backfill',
    description:
      'Pre-creates the Entra ID guest object for existing members on tenant-backed ' +
      'OneDrive/SharePoint connectors, skipping true personal Microsoft accounts. ' +
      'Runs for all members regardless of Firma role — Graph safely no-ops for ' +
      'members who are already tenant-internal. Safe to run multiple times.',
    run: () => import('./onedrive-guest-backfill').then((m) => m.run()),
  },
  {
    id: 'brio-member-backfill',
    name: 'Brio PMO Member Backfill',
    description:
      'Provisions the Brio PMO agent account for each firm and adds it as a firm member and to '
      + 'every engagement, so its file operations are attributable in the Audit tab. The account '
      + 'is a locked Supabase user on a no-inbox domain with sign-in banned. New firms and '
      + 'engagements get this automatically. Skips what already has it. Safe to run multiple times.',
    run: () => import('./brio-member-backfill').then((m) => m.run()),
  },
]

export function findScript(id: string): AdminScript | undefined {
  return adminScripts.find((s) => s.id === id)
}
