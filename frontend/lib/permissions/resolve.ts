/**
 * Capability resolution and gate visibility
 *
 * - resolveProjectCapabilitiesForUser(orgId, clientId, projectId): CapabilitySet from real user
 * - resolveProjectCapabilitiesForPersona(personaSlug): CapabilitySet for View As (from RBAC)
 * - getVisibleGates(capabilities, scope): GateId[] that the user/persona can see
 * - canAccessGate(gateId, capabilities): boolean for a single gate
 */

import type { CapabilitySet, GateId, GateScope } from './types'
import { PROJECT_GATES } from './ui-gates.config'
import {
  canViewProject,
  canViewProjectSettings,
  canViewProjectInternalTabs,
  canEditProject,
} from '@/lib/permission-helpers'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Resolve capabilities for real user (server-side, with org/client/project context)
// ---------------------------------------------------------------------------

export async function resolveProjectCapabilitiesForUser(
  orgId: string,
  clientId: string,
  projectId: string
): Promise<CapabilitySet> {
  const [canView, canViewInternal, canManage, canEdit] = await Promise.all([
    canViewProject(orgId, clientId, projectId),
    canViewProjectInternalTabs(orgId, clientId, projectId),
    canViewProjectSettings(orgId, clientId, projectId),
    canEditProject(orgId, clientId, projectId),
  ])
  return {
    'project:can_view': canView,
    'project:can_view_internal': canViewInternal,
    'project:can_manage': canManage,
    'project:can_edit': canEdit,
  }
}

// ---------------------------------------------------------------------------
// Resolve capabilities for a persona (View As; from static map)
// ---------------------------------------------------------------------------

export async function resolveProjectCapabilitiesForPersona(
  personaSlug: string
): Promise<CapabilitySet> {
  const { getCapabilitiesForPersona } = await import('./persona-map')

  // Static code-based lookup
  const capabilities = getCapabilitiesForPersona(personaSlug)

  return {
    'project:can_view': capabilities['project:can_view'] ?? false,
    'project:can_view_internal': capabilities['project:can_view_internal'] ?? false,
    'project:can_manage': capabilities['project:can_manage'] ?? false,
    'project:can_edit': capabilities['project:can_edit'] ?? false,
  }
}

// ---------------------------------------------------------------------------
// Gate visibility: which gates pass given a capability set
// ---------------------------------------------------------------------------

export function canAccessGate(
  gateId: GateId,
  capabilities: CapabilitySet
): boolean {
  const gate = PROJECT_GATES.find((g) => g.id === gateId)
  if (!gate) return false
  const requireAll = gate.requireAll !== false
  if (requireAll) {
    return gate.requiredCapabilities.every((key) => capabilities[key] === true)
  }
  return gate.requiredCapabilities.some((key) => capabilities[key] === true)
}

export function getVisibleGates(
  capabilities: CapabilitySet,
  scope?: GateScope
): GateId[] {
  const gates = scope ? PROJECT_GATES.filter((g) => g.scope === scope) : PROJECT_GATES
  return gates.filter((g) => canAccessGate(g.id as GateId, capabilities)).map((g) => g.id as GateId)
}

/** Returns a map gateId -> visible for easy lookup in UI. */
export function getGateVisibilityMap(
  capabilities: CapabilitySet,
  scope?: GateScope
): Record<string, boolean> {
  const gates = scope ? PROJECT_GATES.filter((g) => g.scope === scope) : PROJECT_GATES
  const map: Record<string, boolean> = {}
  for (const g of gates) {
    map[g.id] = canAccessGate(g.id as GateId, capabilities)
  }
  return map
}
