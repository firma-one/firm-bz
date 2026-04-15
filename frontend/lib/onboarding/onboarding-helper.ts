import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { FirmService } from '@/lib/firm-service'
import { ClientService } from '@/lib/services/client.service'
import { projectService } from '@/lib/services/project.service'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { createAdminClient } from '@/utils/supabase/admin'
import { safeInngestSend } from '@/lib/inngest/client'
import { SANDBOX_FIRM_NAME_FALLBACK, SANDBOX_HIERARCHY } from '@/lib/services/sample-file-service'
import { buildDefaultSandboxFirmName } from '@/lib/onboarding/sandbox-firm-name'
import {
  findSandboxFirmUnderWorkspaceRoot,
  type SandboxDriveClient,
} from '@/lib/connectors/pockett-structure.service'
import {
  importDetectedOrganization,
  buildDetectedOrganizationFromSandboxDriveMeta,
} from '@/lib/services/auto-import'
import { ensurePolarFreePlanForSandboxFirm } from '@/lib/billing/polar-free-plan'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'

/** One demo contact per sandbox client (keys match `clientName` in sandbox-hierarchy.json firm tree). */
const SANDBOX_CLIENT_PRIMARY_CONTACTS: Record<
  string,
  { name: string; title: string; phone?: string; notes?: string }
> = {
  'Acme Robotics': {
    name: 'Jordan Lee',
    title: 'VP of Marketing',
    phone: '+1 (555) 201-4400',
    notes: 'Primary marketing stakeholder for engagements.',
  },
  'Horizon FinTech': {
    name: 'Sam Rivera',
    title: 'Head of Growth',
    phone: '+1 (555) 302-8800',
    notes: 'Main point of contact for GTM and lifecycle programs.',
  },
  'Nova Health Systems': {
    name: 'Dr. Morgan Patel',
    title: 'Director of Communications',
    phone: '+1 (555) 403-1200',
    notes: 'Clinical marketing and public affairs liaison.',
  },
}

export interface SandboxOnboardingInput {
  userId: string
  userEmail: string
  firstName?: string
  lastName?: string
  connectionId: string
  /** Display name for the sandbox firm; empty → derived from firstName + fallback. */
  sandboxFirmName?: string
}

export interface SandboxOnboardingResult {
  success: true
  firm: { id: string; slug: string; name: string }
  orgFolderId: string
}

function isLegacySandboxFirmName(name: string | null | undefined): boolean {
  const normalized = (name ?? '').trim().toLowerCase()
  if (!normalized) return false
  return (
    normalized === SANDBOX_FIRM_NAME_FALLBACK.trim().toLowerCase() ||
    normalized === 'pockett inc' ||
    normalized === 'sandbox firm'
  )
}

function getSandboxFirmNameForAdmin(input: SandboxOnboardingInput): string {
  return buildDefaultSandboxFirmName(input.firstName, SANDBOX_FIRM_NAME_FALLBACK)
}

async function normalizeSandboxFirmNameForAdmin(
  input: SandboxOnboardingInput,
  firm: { id: string; name: string; sandboxOnly: boolean }
): Promise<string> {
  if (!firm.sandboxOnly) return firm.name
  const desired = getSandboxFirmNameForAdmin(input)
  const current = (firm.name || '').trim()
  if (!desired || current === desired) return firm.name
  const shouldRename = isLegacySandboxFirmName(current)
  if (!shouldRename) return firm.name
  await (prisma as any).firm.update({
    where: { id: firm.id },
    data: { name: desired, updatedBy: input.userId },
  })
  return desired
}

async function provisionPolarFreePlanForOnboardingFirm(
  input: SandboxOnboardingInput,
  firm: { id: string }
): Promise<void> {
  const customerName =
    [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ').trim() || null
  await ensurePolarFreePlanForSandboxFirm({
    firmId: firm.id,
    userEmail: input.userEmail,
    customerName,
    userId: input.userId,
  })
}

async function patchConnectorSandboxOnboardingProgress(connectionId: string, userId: string): Promise<void> {
  const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
  if (!connector) return
  const currentSettings = (connector.settings as any) || {}
  await (prisma as any).connector.update({
    where: { id: connectionId },
    data: {
      settings: {
        ...currentSettings,
        onboarding: {
          currentStep: 3,
          isComplete: false,
          driveConnected: true,
          testOrgCreated: true,
          orgsImported: [],
          defaultOrgSlug: '',
          lastUpdated: new Date().toISOString(),
        },
      },
      updatedBy: userId,
    },
  })
}

async function patchFirmSandboxOnboardingProgress(firmId: string, userId: string): Promise<void> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
  if (!firm) return
  const currentSettings = (firm.settings as Record<string, unknown>) || {}
  await prisma.firm.update({
    where: { id: firmId },
    data: {
      settings: {
        ...currentSettings,
        onboarding: {
          currentStep: 3,
          isComplete: false,
          stage: 'sandbox_created',
          driveConnected: true,
          lastUpdated: new Date().toISOString(),
        },
      },
      updatedBy: userId,
    },
  })
}

async function setDefaultFirmAndJwt(userId: string, firm: { id: string; slug: string }): Promise<void> {
  const admin = createAdminClient()
  const { data: fresh } = await admin.auth.admin.getUserById(userId)
  const existingApp = (fresh?.user?.app_metadata ?? {}) as Record<string, unknown>

  await Promise.all([
    FirmService.setDefaultFirm(userId, firm.id),
    admin.auth.admin
      .updateUserById(userId, {
        app_metadata: mergeLeanAppMetadata(existingApp, {
          active_firm_id: firm.id,
          active_firm_slug: firm.slug,
          active_persona: 'firm_admin',
        }),
      })
      .catch((e: Error) => logger.error('JWT metadata injection failed', e)),
    invalidateUserSettingsPlus(userId),
  ])
}

async function loadSandboxDriveClientsFromDb(firmId: string): Promise<SandboxDriveClient[]> {
  const clients = await prisma.client.findMany({
    where: { firmId, deletedAt: null },
    include: {
      engagements: {
        where: { isDeleted: false, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  return clients.map((c) => ({
    clientId: c.id,
    clientSlug: c.slug,
    clientName: c.name,
    projects: c.engagements.map((e) => ({
      projectId: e.id,
      projectSlug: e.slug,
      projectName: e.name,
    })),
  }))
}

/**
 * Ensures Drive sandbox folder structure, connector org map, client/project folder ids, and sample-file job.
 * Idempotent: uses findOrCreate on Drive.
 */
async function finalizeSandboxDriveConnectorAndIndexing(
  firm: { id: string; slug: string; name: string },
  orgFolderId: string,
  connectionId: string,
  userId: string
): Promise<void> {
  const adapter = await googleDriveConnector.createGoogleDriveAdapter(connectionId)
  const sandboxClients = await loadSandboxDriveClientsFromDb(firm.id)
  if (sandboxClients.length === 0) {
    logger.warn('Sandbox firm has no clients in DB; skipping Drive structure / connector map sync', {
      firmId: firm.id,
    })
  }

  const driveStructure = await googleDriveConnector.createSandboxDriveStructure(
    connectionId,
    adapter,
    orgFolderId,
    sandboxClients
  )

  const connectorRow = await (prisma as any).connector.findUnique({
    where: { id: connectionId },
    select: { settings: true },
  })
  const currentSettings = (connectorRow?.settings as Record<string, unknown>) || {}
  const organizations = (currentSettings.organizations as Record<string, unknown>) || {}
  await (prisma as any).connector.update({
    where: { id: connectionId },
    data: {
      settings: {
        ...currentSettings,
        organizations: {
          ...organizations,
          [firm.id]: {
            orgFolderId,
            clientFolderIds: driveStructure.clientFolderIds,
            projectFolderIds: driveStructure.projectFolderIds,
            projectFolderSettings: driveStructure.projectFolderSettings,
          },
        },
      },
      updatedBy: userId,
    },
  })

  const clientRows = await prisma.client.findMany({
    where: { firmId: firm.id, id: { in: sandboxClients.map((c) => c.clientId) } },
    select: { id: true, slug: true, settings: true },
  })
  const clientRowById = new Map(clientRows.map((r) => [r.id, r]))
  await Promise.all(
    sandboxClients.map(({ clientSlug, clientId }) => {
      const row = clientRowById.get(clientId)
      const df = driveStructure.clientFolderIds[clientSlug]
      return prisma.client.update({
        where: { id: clientId },
        data: {
          driveFolderId: df,
          settings: {
            ...((row?.settings as Record<string, unknown>) || {}),
            driveFolderId: df,
          },
          updatedBy: userId,
        },
      })
    })
  )

  const allProjects = sandboxClients.flatMap((c) => c.projects)
  await Promise.all(
    allProjects.map((p) =>
      prisma.engagement.update({
        where: { id: p.projectId },
        data: {
          connectorRootFolderId: driveStructure.projectFolderIds[p.projectSlug],
          updatedBy: userId,
        },
      })
    )
  )

  const populatePayload = allProjects.map((p) => ({
    projectId: p.projectId,
    projectName: p.projectName,
    rootFolderId: driveStructure.projectFolderIds[p.projectSlug],
    generalFolderId: driveStructure.projectFolderSettings[p.projectSlug]?.generalFolderId,
    stagingFolderId: driveStructure.projectFolderSettings[p.projectSlug]?.stagingFolderId,
    confidentialFolderId: driveStructure.projectFolderSettings[p.projectSlug]?.confidentialFolderId,
  }))
  if (populatePayload.length > 0) {
    safeInngestSend('sandbox.populate.sample-files.requested', {
      organizationId: firm.id,
      connectionId,
      projects: populatePayload,
    }).catch((e: Error) => logger.warn('Failed to trigger sandbox populate', e))
  }

  await invalidateUserSettingsPlus(userId)
}

/**
 * Runs the full sandbox onboarding flow: firm + members, Drive firm folder, DB hierarchy, connector map, Inngest.
 *
 * Branches (one sandbox per workspace root / connector):
 * - Sandbox `.meta` on Drive + matching DB firm for this user → skip firm creation; sync Drive/connector.
 * - Sandbox `.meta` on Drive, no DB firm → import from Drive (IMPORT), then sync.
 * - Otherwise → create new sandbox firm and folders (existing path).
 */
export async function runSandboxOnboarding(
  input: SandboxOnboardingInput
): Promise<SandboxOnboardingResult> {
  const userId = input.userId
  const connectionId = input.connectionId
  const trimmedFirmName = (input.sandboxFirmName || '').trim()
  const name =
    trimmedFirmName ||
    buildDefaultSandboxFirmName(input.firstName, SANDBOX_FIRM_NAME_FALLBACK)

  const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
  if (!connector || connector.status !== 'ACTIVE') {
    throw new Error('Connector not active')
  }

  const driveRootFolderId = await googleDriveConnector.resolveWorkspaceRootFolderId(connectionId)

  const adapter = await googleDriveConnector.createGoogleDriveAdapter(connectionId)
  const existingSandbox = await findSandboxFirmUnderWorkspaceRoot(
    adapter,
    connectionId,
    driveRootFolderId
  )

  if (existingSandbox) {
    const firmRow = await (prisma as any).firm.findUnique({
      where: { slug: existingSandbox.slug },
      include: { members: true },
    })
    const member = firmRow?.members?.find((m: { userId: string }) => m.userId === userId)

    if (firmRow && member && firmRow.sandboxOnly === true && firmRow.connectorId === connectionId) {
      logger.info('Sandbox firm already exists on Drive and in DB; skipping creation', {
        slug: existingSandbox.slug,
        firmId: firmRow.id,
      })
      if (firmRow.firmFolderId !== existingSandbox.folderId) {
        await (prisma as any).firm.update({
          where: { id: firmRow.id },
          data: { firmFolderId: existingSandbox.folderId, updatedBy: userId },
        })
      }
      const normalizedName = await normalizeSandboxFirmNameForAdmin(input, {
        id: firmRow.id,
        name: firmRow.name,
        sandboxOnly: Boolean(firmRow.sandboxOnly),
      })
      await patchConnectorSandboxOnboardingProgress(connectionId, userId)
      await patchFirmSandboxOnboardingProgress(firmRow.id, userId)
      const firm = await FirmService.getFirmById(firmRow.id, userId)
      if (!firm) {
        throw new Error('Could not load firm after sandbox reuse')
      }
      const firmDisplayName = normalizedName || firm.name
      await setDefaultFirmAndJwt(userId, firm)
      await finalizeSandboxDriveConnectorAndIndexing(
        firm,
        existingSandbox.folderId,
        connectionId,
        userId
      )
      await provisionPolarFreePlanForOnboardingFirm(input, firm)
      return {
        success: true,
        firm: { id: firm.id, slug: firm.slug, name: firmDisplayName },
        orgFolderId: existingSandbox.folderId,
      }
    }

    if (!firmRow) {
      logger.info('Sandbox meta on Drive without DB firm; importing from Drive', {
        slug: existingSandbox.slug,
        folderId: existingSandbox.folderId,
      })
      const detected = buildDetectedOrganizationFromSandboxDriveMeta(
        existingSandbox.folderId,
        existingSandbox.meta
      )
      const importResult = await importDetectedOrganization(
        detected,
        connectionId,
        adapter,
        userId,
        undefined,
        undefined,
        false,
        { sandboxOnly: true, allowDomainAccess: false }
      )
      await patchConnectorSandboxOnboardingProgress(connectionId, userId)
      const firm = await FirmService.getFirmById(importResult.orgId, userId)
      if (!firm) {
        throw new Error('Import did not produce an accessible firm')
      }
      await patchFirmSandboxOnboardingProgress(firm.id, userId)
      const normalizedName = await normalizeSandboxFirmNameForAdmin(input, {
        id: firm.id,
        name: firm.name,
        sandboxOnly: true,
      })
      const firmDisplayName = normalizedName || firm.name
      await setDefaultFirmAndJwt(userId, firm)
      await finalizeSandboxDriveConnectorAndIndexing(
        firm,
        existingSandbox.folderId,
        connectionId,
        userId
      )
      await provisionPolarFreePlanForOnboardingFirm(input, firm)
      return {
        success: true,
        firm: { id: firm.id, slug: firm.slug, name: firmDisplayName },
        orgFolderId: existingSandbox.folderId,
      }
    }

    throw new Error(
      'A sandbox workspace folder already exists on Google Drive for this connector, but it is not linked to your account as the sandbox firm. Remove the duplicate folder or contact support.'
    )
  }

  // Greenfield: create firm, Drive firm folder, clients + engagements (DB projects), then sync connector + Drive.
  const firm = await FirmService.createFirmWithMember({
    userId,
    email: input.userEmail,
    firstName: input.firstName || '',
    lastName: input.lastName || '',
    firmName: name,
    connectorId: connectionId,
    allowDomainAccess: false,
    sandboxOnly: true,
  })
  await normalizeSandboxFirmNameForAdmin(input, {
    id: firm.id,
    name: firm.name,
    sandboxOnly: true,
  })

  await patchConnectorSandboxOnboardingProgress(connectionId, userId)
  await patchFirmSandboxOnboardingProgress(firm.id, userId)

  const setupResult = await googleDriveConnector.setupOrgFolder(
    connectionId,
    driveRootFolderId,
    firm.id,
    userId
  )
  if (!setupResult.orgId) {
    throw new Error('Failed to create Google Drive folder structure')
  }

  await setDefaultFirmAndJwt(userId, firm)

  const orgId = firm.id
  const clientResults: {
    client: Awaited<ReturnType<typeof ClientService.createClient>>
    engagementEntries: (typeof SANDBOX_HIERARCHY)[0]['engagements']
  }[] = []
  for (const clientEntry of SANDBOX_HIERARCHY) {
    const client = await ClientService.createClient({
      firmId: orgId,
      name: clientEntry.clientName,
      creatorUserId: userId,
      sandboxOnly: true,
    })

    const preset =
      SANDBOX_CLIENT_PRIMARY_CONTACTS[clientEntry.clientName] ?? {
        name: 'Alex Kim',
        title: 'Primary contact',
        phone: '+1 (555) 100-0000',
        notes: 'Sample sandbox contact for demos.',
      }
    await prisma.clientContact.create({
      data: {
        firmId: orgId,
        clientId: client.id,
        name: preset.name,
        email: `primary.${client.slug}@sandbox.firmaone.com`,
        phone: preset.phone ?? null,
        title: preset.title,
        notes: preset.notes ?? null,
        tags: [],
        engagementId: null,
        createdBy: userId,
        updatedBy: userId,
      },
    })

    clientResults.push({ client, engagementEntries: clientEntry.engagements })
  }

  const sandboxClients: SandboxDriveClient[] = clientResults.map(({ client }) => ({
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    projects: [],
  }))
  for (const { client, engagementEntries } of clientResults) {
    const sandboxClient = sandboxClients.find((sc) => sc.clientId === client.id)!
    for (const engagementEntry of engagementEntries) {
      const { project } = await projectService.createProject(
        orgId,
        client.id,
        engagementEntry.name,
        userId,
        '',
        true,
        true
      )
      sandboxClient.projects.push({
        projectId: project.id,
        projectSlug: project.slug,
        projectName: engagementEntry.name,
      })
    }
  }

  await finalizeSandboxDriveConnectorAndIndexing(firm, setupResult.orgId, connectionId, userId)

  await provisionPolarFreePlanForOnboardingFirm(input, firm)

  return {
    success: true,
    firm: { id: firm.id, slug: firm.slug, name: firm.name },
    orgFolderId: setupResult.orgId,
  }
}

/**
 * **Async Stage 1 (sandbox)** — invoked only from Inngest (`sandbox.provision.requested`), not from the
 * create-sandbox HTTP handler. Creates Drive firm folder + engagement tree, DB clients/engagements/contacts,
 * connector org map, enqueues sample documents + indexing (`sandbox.populate.sample-files.requested`),
 * then marks firm onboarding complete.
 *
 * Polar free-plan DB + customer linking runs only in **synchronous** Stage 1 (`ensurePolarFreePlanForSandboxFirm`
 * from `create-sandbox`), not here.
 */
export async function provisionSandboxHierarchyForFirm(input: {
  firmId: string
  userId: string
  userEmail: string
  firstName?: string
  lastName?: string
  connectionId: string
}): Promise<void> {
  const { firmId, userId, connectionId } = input
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, slug: true, name: true, connectorId: true, settings: true },
  })
  if (!firm) {
    throw new Error('Firm not found for sandbox provisioning')
  }

  const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
  if (!connector || connector.status !== 'ACTIVE') {
    throw new Error('Connector not active')
  }

  const driveRootFolderId = await googleDriveConnector.resolveWorkspaceRootFolderId(connectionId)

  const setupResult = await googleDriveConnector.setupOrgFolder(
    connectionId,
    driveRootFolderId,
    firm.id,
    userId
  )
  const orgFolderId = setupResult.orgId
  if (!orgFolderId) {
    throw new Error('Failed to setup sandbox firm folder')
  }

  await patchConnectorSandboxOnboardingProgress(connectionId, userId)
  await patchFirmSandboxOnboardingProgress(firm.id, userId)

  for (const clientEntry of SANDBOX_HIERARCHY) {
    const existingClient = await prisma.client.findFirst({
      where: {
        firmId: firm.id,
        deletedAt: null,
        name: { equals: clientEntry.clientName, mode: 'insensitive' },
      },
    })
    const client = existingClient ?? await ClientService.createClient({
        firmId: firm.id,
        name: clientEntry.clientName,
        creatorUserId: userId,
        sandboxOnly: true,
      })

    const contactCount = await prisma.clientContact.count({
      where: { firmId: firm.id, clientId: client.id },
    })
    if (contactCount === 0) {
      const preset =
        SANDBOX_CLIENT_PRIMARY_CONTACTS[clientEntry.clientName] ?? {
          name: 'Alex Kim',
          title: 'Primary contact',
          phone: '+1 (555) 100-0000',
          notes: 'Sample sandbox contact for demos.',
        }
      await prisma.clientContact.create({
        data: {
          firmId: firm.id,
          clientId: client.id,
          name: preset.name,
          email: `primary.${client.slug}@sandbox.firmaone.com`,
          phone: preset.phone ?? null,
          title: preset.title,
          notes: preset.notes ?? null,
          tags: [],
          engagementId: null,
          createdBy: userId,
          updatedBy: userId,
        },
      })
    }

    for (const engagementEntry of clientEntry.engagements) {
      const existing = await prisma.engagement.findFirst({
        where: {
          firmId: firm.id,
          clientId: client.id,
          deletedAt: null,
          isDeleted: false,
          name: { equals: engagementEntry.name, mode: 'insensitive' },
        },
        select: { id: true },
      })
      if (!existing) {
        await projectService.createProject(
          firm.id,
          client.id,
          engagementEntry.name,
          userId,
          '',
          true,
          true
        )
      }
    }
  }

  await finalizeSandboxDriveConnectorAndIndexing(
    { id: firm.id, slug: firm.slug, name: firm.name },
    orgFolderId,
    connectionId,
    userId
  )

  const currentSettings = (firm.settings as Record<string, unknown>) || {}
  await prisma.firm.update({
    where: { id: firm.id },
    data: {
      settings: {
        ...currentSettings,
        onboarding: {
          currentStep: 3,
          isComplete: true,
          stage: 'completed',
          driveConnected: true,
          lastUpdated: new Date().toISOString(),
        },
      },
      updatedBy: userId,
    },
  })
}
