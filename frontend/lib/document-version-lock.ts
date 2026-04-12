export type VersionLockDowngrade = { permissionId: string; previousRole: string }

export type VersionLockState = {
  lockedAt: string
  downgraded: VersionLockDowngrade[]
}

export function getVersionLockFromSettings(settings: unknown): VersionLockState | null {
  if (!settings || typeof settings !== 'object') return null
  const s = settings as Record<string, unknown>
  const vl = s.versionLock as Record<string, unknown> | undefined
  if (!vl || typeof vl.lockedAt !== 'string') return null
  const downgraded = Array.isArray(vl.downgraded)
    ? (vl.downgraded as unknown[]).filter(
        (x): x is VersionLockDowngrade =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as VersionLockDowngrade).permissionId === 'string' &&
          typeof (x as VersionLockDowngrade).previousRole === 'string'
      )
    : []
  return { lockedAt: vl.lockedAt, downgraded }
}

export function isDocumentVersionLocked(settings: unknown): boolean {
  return getVersionLockFromSettings(settings) != null
}
