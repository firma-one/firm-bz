// Types for our API responses

// Google Drive Connection types
export interface GoogleDriveConnection {
  id: string
  email: string
  name: string
  connectedAt: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR'
  lastSyncAt?: string
}
export interface DocumentItem {
  id: string
  name: string
  type: string
  mimeType?: string
  size: number
  path: string
  modifiedTime: string
  createdTime: string
  lastAccessed: string
  accessCount: number
  sharing: {
    shared: boolean
    sharedWith: string[]
    sharingStatus: string
    expiryDate: string | null
    createdDate: string
    permissions: Array<{
      type: string
      role: string
      email?: string
      name?: string
      expires?: string
    }>
  }
  engagement: {
    views: number
    downloads: number
    comments: number
    shares: number
  }
  isDuplicate: boolean
  contributors: Array<{
    displayName: string
    role: string
    edits: number
    comments: number
    lastActivity: string
    emailAddress: string
  }>
  parents: string[]
  owners?: Array<{
    displayName: string
    emailAddress: string
    photoLink: string
  }>
  folder?: {
    id: string
    name: string
    path: string
  }
  duplicateCount?: number
  tags?: string[]
  status?: string
  // Google Drive API specific properties
  webViewLink?: string
  webContentLink?: string
  iconLink?: string
  thumbnailLink?: string
  viewedByMeTime?: string
  version?: string
  trashed?: boolean
  starred?: boolean
  explicitlyTrashed?: boolean
  // permissions?: any[] // Replaced by specific type below
  capabilities?: any
  contentHints?: any
  exportLinks?: { [key: string]: string | undefined }
  lastModifyingUser?: any
  ownedByMe?: boolean
  writersCanShare?: boolean
  copyRequiresWriterPermission?: boolean
  isAppAuthorized?: boolean
  dueDate?: string | null
  // Security & Sharing Enhancements
  permissions?: Array<{
    type: string // user, group, domain, anyone
    role: string // owner, organizer, fileOrganizer, writer, commenter, reader
    emailAddress?: string
    domain?: string
    displayName?: string
    expirationTime?: string
    deleted?: boolean
  }>
  badges?: Array<{
    type: 'risk' | 'attention' | 'stale' | 'sensitive'
    text: string
  }>
}

export interface FolderItem {
  id: string
  name: string
  type: string
  mimeType?: string
  path: string
  parents?: string[]
  documentCount: number
  createdTime: string
  modifiedTime: string
  lastAccessed?: string
  accessCount?: number
  sharing?: {
    shared: boolean
    sharedWithMeTime?: string
  }
  capabilities?: {
    canAddChildren: boolean
    canDelete: boolean
    canEdit: boolean
    canShare: boolean
  }
}

export interface DocumentsResponse {
  totalDocuments: number
  totalFolders: number
  lastSyncTime: string
  documents: DocumentItem[]
  folders: FolderItem[]
  summary: {
    totalDocuments: number
    totalFolders: number
    fileTypes: {
      documents: number
      spreadsheets: number
      presentations: number
      pdfs: number
    }
    engagementSummary: {
      pastHour: number
      past7Days: number
      past30Days: number
      past90Days: number
      dormant: number
      duplicates: number
    }
    sharingStatus: {
      active: number
      expiring: number
      expired: number
      private: number
    }
    topContributors: Array<{
      displayName: string
      emailAddress: string
      documentsCount: number
      editsCount: number
      commentsCount: number
      totalActivity: number
    }>
  }
}

// Reminder and Due Date related types
export interface Reminder {
  id: string
  documentId: string
  documentName: string
  dueDate: string
  createdAt: string
  isCompleted: boolean
  reminderType: 'due_date' | 'custom'
  message?: string
}

export interface DueDateInfo {
  dueDate: string
  isOverdue: boolean
  daysUntilDue: number
  formattedDate: string
}

export interface DriveFile {
  id: string
  /** Internal projectDocument UUID (never shown to end-users as Drive id). Present for files indexed into engagement_documents. */
  projectDocumentId?: string
  name: string
  mimeType: string
  webViewLink: string
  iconLink: string
  modifiedTime: string
  createdTime?: string
  lastModifyingUser?: {
    displayName: string
    photoLink?: string
  }
  owners?: {
    displayName: string
    photoLink?: string
    emailAddress?: string
  }[]
  parents?: string[]
  source?: string
  connectorId?: string
  viewedByMeTime?: string // ISO date string
  lastViewedTime?: string // ISO date string (alias for viewedByMeTime)
  sharedTime?: string // ISO date string
  size?: string | number // bytes as string or number
  activityCount?: number
  lastAction?: string
  parentName?: string
  actorEmail?: string
  activityTimestamp?: string
  badges?: Array<{
    type: 'risk' | 'attention' | 'stale' | 'sensitive'
    text: string
  }>
  permissions?: Array<{
    id: string
    type: string
    role: string
    emailAddress?: string
    domain?: string
    displayName?: string
    expirationTime?: string
    deleted?: boolean
  }>
  // Vector search metadata
  matchType?: 'keyword' | 'name' | 'semantic'
  score?: number
  metadata?: {
    summary?: string
    [key: string]: any
  }
  /** True when engagement lead locked the document version (Drive + settings). */
  versionLocked?: boolean
}

export interface DriveRevision {
  id: string
  mimeType: string
  modifiedTime: string
  keepForever?: boolean
  published?: boolean
  lastModifyingUser?: {
    displayName: string
    photoLink?: string
    me?: boolean
  }
  originalFilename?: string
  size?: string
  exportLinks?: Record<string, string>
}

export interface DriveActivity {
  primaryActionDetail: {
    edit?: {}
    move?: {
      addedParents: Array<{ title: string; isOwner?: boolean }>
      removedParents: Array<{ title: string; isOwner?: boolean }>
    }
    rename?: {
      oldTitle: string
      newTitle: string
    }
    create?: {
      new?: {}
      upload?: {}
      copy?: { originalObject: { name: string } }
    }
    delete?: {}
    restore?: {}
    permissionChange?: {
      addedPermissions: Array<{ role: string; user?: { knownUser: { personName: string } } }>
      removedPermissions: Array<{ role: string; user?: { knownUser: { personName: string } } }>
    }
    comment?: {
      post?: { subtype: string }
      assignment?: { subtype: string }
      suggestion?: { subtype: string }
    }
  }
  actors: Array<{
    user?: {
      knownUser: {
        personName: string
      }
    }
  }>
  actions: Array<{
    detail: any
  }>
  targets: Array<{
    driveItem: {
      name: string
      title: string
      file: any
    }
  }>
  timestamp: string
}
