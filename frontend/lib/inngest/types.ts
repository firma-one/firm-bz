/**
 * Inngest Event Type Definitions
 *
 * This file defines the event payloads for async permission revocation.
 * These events are triggered when sharing settings change, member roles change,
 * or projects are archived/deleted.
 */

/**
 * Fired when Guest or External Collaborator access is disabled on a document
 */
export interface SharingSettingsUpdatedEvent {
  type: 'sharing.settings.updated'
  data: {
    projectId: string
    organizationId: string
    documentId: string // externalId from ProjectDocumentSharing (Google Drive file ID)
    sharingId: string // ProjectDocumentSharing.id
    disabledPersonas: ('guest' | 'externalCollaborator')[]
    timestamp: string
    userId: string // Supabase user ID of who made the change
  }
}

/**
 * Fired when a project member's persona (role) changes
 */
export interface ProjectMemberPersonaUpdatedEvent {
  type: 'project.member.persona.updated'
  data: {
    projectId: string
    organizationId: string
    memberId: string // ProjectMember.id
    userId: string // Supabase user ID
    oldPersonaId: string | null
    newPersonaId: string
    oldPersonaSlug: string | null // e.g., 'eng_viewer', 'eng_ext_collaborator'
    newPersonaSlug: string // e.g., 'eng_member', 'eng_admin'
    timestamp: string
    changedBy: string // Supabase user ID of who made the change
  }
}

/**
 * Fired when a project is archived (closed) or deleted
 */
export interface ProjectArchivedEvent {
  type: 'project/archived'
  data: {
    projectId: string
    organizationId: string
    reason: 'closed' | 'deleted' // Distinguish between closure and deletion
    timestamp: string
  }
}

/**
 * Fired when a new member joins a project (invitation accepted)
 * or when a member's persona is upgraded to an access-granting role
 */
export interface ProjectMemberAddedEvent {
  type: 'project.member.added'
  data: {
    projectId: string
    organizationId: string
    memberId: string
    userId: string
    email: string
    personaSlug: string // e.g., 'eng_viewer', 'eng_ext_collaborator', 'eng_member'
    timestamp: string
  }
}

/**
 * Fired when an EC/EV member is removed from a project.
 * Triggers revocation of their document-level Drive permissions.
 */
export interface ProjectMemberRemovedEvent {
  type: 'project.member.removed'
  data: {
    projectId: string
    organizationId: string
    userId: string
    personaSlug: string // role of the removed member e.g. 'eng_ext_collaborator', 'eng_viewer'
    timestamp: string
    removedBy: string // Supabase user ID of who made the change
  }
}

// Union type for all permission-related events
export type PermissionEvent =
  | SharingSettingsUpdatedEvent
  | ProjectMemberPersonaUpdatedEvent
  | ProjectArchivedEvent
  | ProjectMemberAddedEvent
  | ProjectMemberRemovedEvent

/**
 * Fired when a single file or folder should be indexed for search
 */
export interface FileIndexRequestedEvent {
  type: 'file.index.requested'
  data: {
    organizationId: string
    clientId?: string | null
    projectId?: string | null
    externalId: string
    fileName: string
    parentId?: string | null
    actorId?: string | null
  }
}

/**
 * Fired when a batch of files/folders should be indexed for search
 */
export interface FileBatchIndexRequestedEvent {
  type: 'file.index.batch.requested'
  data: {
    organizationId: string
    clientId?: string | null
    projectId?: string | null
    files: { externalId: string; fileName: string; parentId?: string | null }[]
    actorId?: string | null
  }
}

/**
 * Fired to trigger a full recursive scan and index of all files within a project's folder tree.
 * Used after onboarding import to index pre-existing Drive content.
 */
export interface ProjectIndexScanRequestedEvent {
  type: 'project.index.scan.requested'
  data: {
    organizationId: string
    clientId?: string | null
    projectId: string
    connectorId: string
    rootFolderIds: string[]
  }
}

/**
 * Fired after sandbox org/clients/projects are created; background job uploads sample files to Drive and triggers indexing.
 */
export interface SandboxPopulateSampleFilesRequestedEvent {
  type: 'sandbox.populate.sample-files.requested'
  data: {
    organizationId: string
    connectionId: string
    projects: Array<{
      projectId: string
      projectName: string
      rootFolderId: string
      generalFolderId?: string
      stagingFolderId?: string
      confidentialFolderId?: string
    }>
  }
}

// Union type for all indexing events
export type IndexingEvent =
  | FileIndexRequestedEvent
  | FileBatchIndexRequestedEvent
  | ProjectIndexScanRequestedEvent

/**
 * Fired to kick off an async background migration of top-level Drive children
 * from oldRootFolderId to newRootFolderId.
 */
export interface WorkspaceMigrateRequestedEvent {
  name: 'workspace.migrate.requested'
  data: {
    connectionId: string
    newRootFolderId: string
    oldRootFolderId: string
    firmId: string
    organizationId?: string
    initiatingUserId: string
    estimatedMinutes: number
    startedAt?: string
  }
}

/**
 * Fired when platform maintenance is enabled — triggers the 2-minute grace period
 * before sessions are killed and maintenance becomes fully active.
 */
export interface PlatformMaintenanceGraceRequestedEvent {
  name: 'platform/maintenance.grace-requested'
  data: {
    graceEndsAt: string // ISO timestamp when grace period expires
    enabledBy: string
  }
}

/**
 * Fired when a reminder should trigger an email.
 * Inngest sleeps until fireAt, then sends (unless the reminder was already marked done).
 */
export interface ReminderEmailScheduledEvent {
  name: 'reminder.email.scheduled'
  data: {
    reminderId: string      // reminder item id — used as cancel key
    entityKey: string       // "platform.clients.id"
    entityValue: string     // actual entity primary key
    entityName: string
    action: string          // "Follow-up"
    userId: string
    firmId: string
    dateKey: string         // "platform.clients.followUpDate"
    fireAt: string          // ISO UTC
    ctaUrl: string | null
  }
}

/**
 * Fired when a reminder is marked done or its date is cleared — cancels the sleeping Inngest run.
 */
export interface ReminderEmailCancelledEvent {
  name: 'reminder.email.cancelled'
  data: { reminderId: string }
}

/**
 * Fired to schedule the next iteration of a recurring reminder email.
 * Fan-forward pattern: each iteration re-emits this event with an updated nextFireAt.
 * Cancelled via 'reminder.recurring.cancelled' matching reminderId.
 */
export interface ReminderRecurringScheduledEvent {
  name: 'reminder.recurring.scheduled'
  data: {
    reminderId: string
    userId: string
    firmId: string
    entityName: string
    entityKey: string
    entityValue: string
    action: string
    ctaUrl: string | null
    dueDate: string | null      // ISO — null means date-less reminder
    frequencyDays: number
    startDaysBeforeDue: number
    nextFireAt: string          // ISO UTC — when to send the next email
  }
}

/**
 * Fired when a reminder is done/cleared — cancels the recurring Inngest run.
 */
export interface ReminderRecurringCancelledEvent {
  name: 'reminder.recurring.cancelled'
  data: { reminderId: string }
}

/**
 * Fired when a due date is set on a Deliverable folder. Schedules email + in-app
 * reminders to all engagement members at 24h and 1h before the due date.
 * Cancelled via 'deliverable.due_date.cancelled' matching documentId.
 */
export interface DeliverableDueDateSetEvent {
  name: 'deliverable.due_date.set'
  data: {
    documentId: string          // deliverable folder id — used as cancel key
    documentName: string
    dueDate: string             // ISO UTC
    memberUserIds: string[]     // all engagement members to notify
    firmId: string | null
    clientId: string | null
    engagementId: string | null
    boardUrl: string | null     // CTA deep-link to the Board card
  }
}

/**
 * Fired when a Deliverable due date is cleared or changed — cancels the
 * sleeping reminder run for that documentId (a fresh set event reschedules it).
 */
export interface DeliverableDueDateCancelledEvent {
  name: 'deliverable.due_date.cancelled'
  data: { documentId: string }
}
