/**
 * Permission framework types.
 * Capabilities are the vocabulary of "what can someone do"; gates are UI elements gated by capabilities.
 */

/** Capability keys used for gate resolution. Add new keys here as personas/features grow. */
export type ProjectCapabilityKey =
  | 'project:can_view'           // View project + Files tab (all personas with project access)
  | 'project:can_view_internal'  // Members, Shares, Insights, Sources (excludes Guest, External Collaborator)
  | 'project:can_manage'        // Settings, edit, manage members (Project Lead, Client Owner, Org Owner)
  | 'project:can_edit'          // Edit project content (create, edit, delete, move docs). eng_admin, eng_member, eng_ext_collaborator; NOT eng_viewer
  | 'firm:can_manage'           // Firm settings and members (Firm Owner/Admin)
  | 'client:can_manage'         // Client settings and members (Org Owner, Client Owner)

/** Extensible: add OrgCapabilityKey | ClientCapabilityKey for org/client-level gates later. */
export type CapabilityKey = ProjectCapabilityKey

/** Resolved capability set: each key is true iff the user/persona has that capability in context. */
export type CapabilitySet = Partial<Record<CapabilityKey, boolean>>

/** Gate identifier: which UI element (tab, sidebar item, button). */
export type ProjectGateId =
  | 'project.files'
  | 'project.members'
  | 'project.shares'
  | 'project.analytics'
  | 'project.sources'
  | 'project.settings'

/** Extensible: add OrgGateId | ClientGateId later. */
export type GateId = ProjectGateId

/** Scope for filtering gates (e.g. only project-level gates). */
export type GateScope = 'project' | 'firm' | 'client'

export interface GateConfig {
  id: GateId
  label: string
  scope: GateScope
  /** Required capabilities: user must have ALL (when requireAll) or ANY (when !requireAll). */
  requiredCapabilities: CapabilityKey[]
  requireAll?: boolean
  /** Optional: for tabs, the tab value for URL (e.g. "files", "settings"). */
  tabValue?: string
}
