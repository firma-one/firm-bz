/**
 * Types and helpers for platform.engagement_documents.settings (sharing/activity/comments).
 * Supports both legacy (flat) and new (nested share/activity/comments) shapes.
 */

/**
 * A document's or deliverable's stage. Not started comes before the Board: a document starts there,
 * and joins its deliverable's Board work at To do (.claude/plans/deliverable-stages-blocked.md).
 */
export type ActivityStatus = 'not_started' | 'to_do' | 'in_progress' | 'in_review' | 'approved'

/** A stage on the Board: To do and beyond. */
export type BoardStage = Exclude<ActivityStatus, 'not_started'>

/** The stages on the Board, in order. */
export const BOARD_STAGES: readonly BoardStage[] = ['to_do', 'in_progress', 'in_review', 'approved']

/** Every stage, in order. */
export const ACTIVITY_STAGES: readonly ActivityStatus[] = ['not_started', ...BOARD_STAGES]

/** Whether a stage is on the Board: To do and beyond. */
export function isOnBoard(stage: ActivityStatus | null | undefined): stage is BoardStage {
  return !!stage && stage !== 'not_started'
}

/**
 * A document's own stage, as stored, or Not started when none is: a document is on the Board only
 * once someone puts it there. (parseSettingsFromDb's To do default stays for deliverables, which
 * start on the Board.)
 */
export function documentStage(settings: unknown): ActivityStatus {
  const raw = settings && typeof settings === 'object'
    ? ((settings as Record<string, unknown>).activity as { status?: unknown } | undefined)?.status
    : undefined
  if (raw === 'done') return 'approved'
  return typeof raw === 'string' && (ACTIVITY_STAGES as readonly string[]).includes(raw) ? (raw as ActivityStatus) : 'not_started'
}

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

  const rawStatus = activity?.status as string | undefined
  // Backward compat: legacy 'done' stored in DB maps to 'approved'
  const normalizedStatus: ActivityStatus = rawStatus === 'done'
    ? 'approved'
    : (ACTIVITY_STAGES as readonly string[]).includes(rawStatus as string)
      ? (rawStatus as ActivityStatus)
      : 'to_do'

  const activityBlock: ActivityBlock = activity
    ? {
        status: normalizedStatus,
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

  // A stage is written only when this write is about the stage, or one was already stored. Writing
  // To do by default put documents on the Board that nobody had put there (a share, an intake, a
  // cached PDF all came through here).
  const hadActivity = !!existing && typeof existing === 'object' && 'activity' in existing && !!existing.activity
  const activity: ActivityBlock | undefined = updates.activity
    ? {
        status: updates.activity.status ?? parsed.activity!.status,
        updatedAt: updates.activity.updatedAt ?? now,
        orderIndex: updates.activity.orderIndex ?? parsed.activity!.orderIndex ?? 0,
      }
    : hadActivity
      ? { ...parsed.activity!, updatedAt: now }
      : undefined

  const comments = [...(parsed.comments || [])]
  if (updates.appendComment) {
    comments.unshift(updates.appendComment)
  }

  // Everything this doesn't manage stays: the lock (private, finalized), the document's description
  // and assignee. Returning only the four blocks below erased them on every share or stage
  // change (2026-10-28) — a private document's lock among them. The legacy flat share keys are the
  // one exception: `share` above supersedes them.
  const kept = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([key]) => !(LEGACY_FLAT_SHARE_KEYS as readonly string[]).includes(key))
  )
  return {
    ...kept,
    share,
    ...(activity ? { activity } : {}),
    comments,
    accessLog: parsed.accessLog || [],
  }
}

/** The pre-`share` shape's top-level keys, which buildSettingsForDb folds into `share`. */
const LEGACY_FLAT_SHARE_KEYS = ['externalCollaborator', 'guest', 'guestOptions', 'publishedVersionId', 'publishedAt'] as const

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

/** Settings that describe the document itself, not how it is shared. */
const ASSET_SETTING_KEYS = ['description', 'assigneeUserId', 'details', 'blocked', 'approvals'] as const

/**
 * What removing a share or un-tagging a deliverable keeps: the document's description and assignee
 * (and the asset details planned in .claude/plans/engagement-assets-details.md). Those
 * paths used to reset settings to {}, which erased them along with the sharing state.
 */
export function assetSettingsOf(settings: unknown): Record<string, unknown> {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  return Object.fromEntries(ASSET_SETTING_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))
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
