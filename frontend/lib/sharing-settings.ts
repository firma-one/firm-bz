/**
 * Types and helpers for platform.engagement_documents.settings (sharing/activity/comments).
 * Supports both legacy (flat) and new (nested share/activity/comments) shapes.
 */

export type ActivityStatus = 'to_do' | 'in_progress' | 'done'

export interface ShareGuestOptions {
  publish?: boolean
  addWatermark?: boolean
  sharePdfOnly?: boolean
  allowDownload?: boolean
  sharedPdfDriveId?: string | null
}

export interface ShareEcOptions {
  allowDownload?: boolean
}

export interface ShareBlock {
  guest: {
    enabled: boolean
    options: ShareGuestOptions
  }
  externalCollaborator: { enabled: boolean; options?: ShareEcOptions }
  createdAt?: string
  createdBy?: string | null
  updatedAt?: string
  updatedBy?: string | null
  publishedVersionId?: string | null
  publishedAt?: string | null
  /** Set when Project Lead finalizes (locks) the share. */
  finalizedAt?: string | null
}

export interface ActivityBlock {
  status: ActivityStatus
  updatedAt: string
  /** Order within the same status lane (0-based). Used for ranking. */
  orderIndex?: number
}

export interface SharingComment {
  createdAt: string
  commentor: string
  comment: string
}

export interface ProjectDocumentSharingSettings {
  share?: ShareBlock
  activity?: ActivityBlock
  comments?: SharingComment[]
  /** Legacy / kept at top level: who accessed and when. */
  accessLog?: Array<{
    at: string
    by: string
    userId?: string | null
    email?: string | null
    sessionId?: string | null
  }>
  /** Legacy flat shape (for backward compat read only). */
  externalCollaborator?: boolean
  guest?: boolean
  guestOptions?: ShareGuestOptions
  publishedVersionId?: string | null
  publishedAt?: string | null
}

const DEFAULT_ACTIVITY: ActivityBlock = {
  status: 'to_do',
  updatedAt: new Date().toISOString(),
  orderIndex: 0,
}

const DEFAULT_SHARE: ShareBlock = {
  guest: {
    enabled: false,
    options: {
      publish: false,
      addWatermark: false,
      sharePdfOnly: false,
      allowDownload: false,
      sharedPdfDriveId: null,
    },
  },
  externalCollaborator: { enabled: false, options: { allowDownload: false } },
}

/** Read settings from DB: supports legacy flat and new nested shape. */
export function parseSettingsFromDb(settings: unknown): ProjectDocumentSharingSettings {
  if (!settings || typeof settings !== 'object') {
    return {
      share: { ...DEFAULT_SHARE, createdAt: undefined, updatedAt: undefined },
      activity: DEFAULT_ACTIVITY,
      comments: [],
    }
  }
  const s = settings as Record<string, unknown>

  // New shape
  const share = s.share as ShareBlock | undefined
  const activity = s.activity as ActivityBlock | undefined
  const comments = Array.isArray(s.comments) ? (s.comments as SharingComment[]) : []

  // Legacy flat
  const legacyEc = s.externalCollaborator === true
  const legacyGuest = s.guest === true
  const legacyOpts = (s.guestOptions as ShareGuestOptions) || {}

  const shareBlock: ShareBlock = share
    ? {
        guest: {
          enabled: share.guest?.enabled ?? legacyGuest,
          options: {
            publish: share.guest?.options?.publish ?? legacyOpts.publish ?? false,
            addWatermark: share.guest?.options?.addWatermark ?? legacyOpts.addWatermark ?? false,
            sharePdfOnly: share.guest?.options?.sharePdfOnly ?? legacyOpts.sharePdfOnly ?? false,
            allowDownload: share.guest?.options?.allowDownload ?? legacyOpts.allowDownload ?? false,
            sharedPdfDriveId: share.guest?.options?.sharedPdfDriveId ?? legacyOpts.sharedPdfDriveId ?? null,
          },
        },
        externalCollaborator: {
          enabled: share.externalCollaborator?.enabled ?? legacyEc,
          options: {
            allowDownload: share.externalCollaborator?.options?.allowDownload ?? false,
          },
        },
        createdAt: share.createdAt,
        createdBy: share.createdBy ?? null,
        updatedAt: share.updatedAt,
        updatedBy: share.updatedBy ?? null,
        publishedVersionId: share.publishedVersionId ?? (s.publishedVersionId as string | null | undefined) ?? null,
        publishedAt: share.publishedAt ?? (s.publishedAt as string | null | undefined) ?? null,
        finalizedAt: share.finalizedAt ?? null,
      }
    : {
        ...DEFAULT_SHARE,
        guest: {
          enabled: legacyGuest,
          options: {
            publish: legacyOpts.publish ?? false,
            addWatermark: legacyOpts.addWatermark ?? false,
            sharePdfOnly: legacyOpts.sharePdfOnly ?? false,
            allowDownload: legacyOpts.allowDownload ?? false,
            sharedPdfDriveId: legacyOpts.sharedPdfDriveId ?? null,
          },
        },
        externalCollaborator: { enabled: legacyEc, options: { allowDownload: false } },
        publishedVersionId: (s.publishedVersionId as string | null) ?? null,
        publishedAt: (s.publishedAt as string | null) ?? null,
      }

  const activityBlock: ActivityBlock = activity
    ? {
        status: activity.status === 'in_progress' || activity.status === 'done' ? activity.status : 'to_do',
        updatedAt: activity.updatedAt || new Date().toISOString(),
        orderIndex: typeof activity.orderIndex === 'number' ? activity.orderIndex : 0,
      }
    : DEFAULT_ACTIVITY

  const accessLog = Array.isArray(s.accessLog) ? s.accessLog : []

  return {
    share: shareBlock,
    activity: activityBlock,
    comments,
    accessLog,
    externalCollaborator: shareBlock.externalCollaborator.enabled,
    guest: shareBlock.guest.enabled,
    guestOptions: shareBlock.guest.options,
    publishedVersionId: shareBlock.publishedVersionId ?? null,
    publishedAt: shareBlock.publishedAt ?? null,
  }
}

/** Build full settings for DB write (new shape). Preserves accessLog and merges share/activity/comments. */
export function buildSettingsForDb(
  existing: Record<string, unknown> | null,
  updates: {
    share?: Partial<ShareBlock>
    activity?: Partial<ActivityBlock>
    appendComment?: SharingComment
    finalizedAt?: string | null
    actorId?: string | null
  }
): Record<string, unknown> {
  const parsed = parseSettingsFromDb(existing || {})
  const now = new Date().toISOString()
  const isFirstShare = !parsed.share?.createdAt

  const share: ShareBlock = {
    ...parsed.share!,
    ...updates.share,
    guest: {
      ...parsed.share!.guest,
      ...updates.share?.guest,
      options: {
        ...parsed.share!.guest.options,
        ...updates.share?.guest?.options,
      },
    },
    externalCollaborator: {
      ...parsed.share!.externalCollaborator,
      ...updates.share?.externalCollaborator,
      options: {
        ...parsed.share!.externalCollaborator?.options,
        ...updates.share?.externalCollaborator?.options,
      },
    },
    createdAt: isFirstShare ? now : parsed.share!.createdAt,
    createdBy: isFirstShare ? (updates.actorId ?? null) : (parsed.share!.createdBy ?? null),
    updatedAt: now,
    updatedBy: updates.actorId ?? null,
  }
  if (updates.finalizedAt !== undefined) share.finalizedAt = updates.finalizedAt

  const activity: ActivityBlock = updates.activity
    ? {
        status: updates.activity.status ?? parsed.activity!.status,
        updatedAt: updates.activity.updatedAt ?? now,
        orderIndex: updates.activity.orderIndex ?? parsed.activity!.orderIndex ?? 0,
      }
    : { ...parsed.activity!, updatedAt: now }

  const comments = [...(parsed.comments || [])]
  if (updates.appendComment) {
    comments.unshift(updates.appendComment)
  }

  return {
    share,
    activity,
    comments,
    accessLog: parsed.accessLog || [],
  }
}

// ---------------------------------------------------------------------------
// Document Lock (intake pending / finalize / private)
// ---------------------------------------------------------------------------

export interface LockBlock {
  type: 'intake' | 'finalize' | 'private'
  uploadedBy?: string
  uploadedAt?: string
  finalizedBy?: string
  finalizedAt?: string
  acceptedBy?: string
  acceptedAt?: string
  downgraded?: Array<{ permissionId: string; previousRole: string }>
}

export function getLock(settings: unknown): LockBlock | null {
  if (!settings || typeof settings !== 'object') return null
  const s = settings as Record<string, unknown>

  // Legacy format: settings.locked === 'private' (read-only compat — new writes use lock.type)
  if (s.locked === 'private') return { type: 'private' }

  const lock = s.lock
  if (!lock || typeof lock !== 'object') return null
  const l = lock as Record<string, unknown>
  if (l.type !== 'intake' && l.type !== 'finalize' && l.type !== 'private') return null
  const downgraded = Array.isArray(l.downgraded)
    ? (l.downgraded as unknown[]).filter(
        (x): x is { permissionId: string; previousRole: string } =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as any).permissionId === 'string' &&
          typeof (x as any).previousRole === 'string'
      )
    : undefined
  return {
    type: l.type as 'intake' | 'finalize' | 'private',
    uploadedBy: typeof l.uploadedBy === 'string' ? l.uploadedBy : undefined,
    uploadedAt: typeof l.uploadedAt === 'string' ? l.uploadedAt : undefined,
    finalizedBy: typeof l.finalizedBy === 'string' ? l.finalizedBy : undefined,
    finalizedAt: typeof l.finalizedAt === 'string' ? l.finalizedAt : undefined,
    acceptedBy: typeof l.acceptedBy === 'string' ? l.acceptedBy : undefined,
    acceptedAt: typeof l.acceptedAt === 'string' ? l.acceptedAt : undefined,
    downgraded,
  }
}

export function isIntakePending(settings: unknown): boolean {
  return getLock(settings)?.type === 'intake'
}

export function isDocumentFinalized(settings: unknown): boolean {
  return getLock(settings)?.type === 'finalize'
}

/** Returns true when the document has been marked private (hidden from EC/EV users). */
export function isDocumentPrivate(settings: unknown): boolean {
  return getLock(settings)?.type === 'private'
}

/** Returns true when the document has any lock type (intake, finalize, or private). */
export function isDocumentLocked(settings: unknown): boolean {
  return getLock(settings) !== null
}

/** Flatten for UI that still expects legacy keys (e.g. Shares list response). */
export function flattenForLegacyUI(parsed: ProjectDocumentSharingSettings) {
  return {
    externalCollaborator: parsed.share?.externalCollaborator?.enabled ?? parsed.externalCollaborator ?? true,
    guest: parsed.share?.guest?.enabled ?? parsed.guest ?? false,
    guestOptions: parsed.share?.guest?.options ?? parsed.guestOptions ?? {},
    ecOptions: parsed.share?.externalCollaborator?.options ?? {},
    publishedVersionId: parsed.share?.publishedVersionId ?? parsed.publishedVersionId ?? null,
    publishedAt: parsed.share?.publishedAt ?? parsed.publishedAt ?? null,
    activity: parsed.activity,
    comments: parsed.comments ?? [],
    finalizedAt: parsed.share?.finalizedAt ?? null,
  }
}
