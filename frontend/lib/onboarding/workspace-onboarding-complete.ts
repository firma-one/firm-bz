import { prisma } from '@/lib/prisma'

export type FirmOnboardingCheckRow = {
    id: string
    settings: unknown
    connectorId: string | null
    sandboxOnly: boolean
}

/**
 * Whether workspace (Drive) onboarding is done for landing, billing banner, and sign-in routing.
 *
 * Primary: `platform.connector.settings.onboarding` (and org folder map for sandbox, where
 * `isComplete` is intentionally left false after hierarchy sync — see onboarding-helper).
 * Fallback: legacy `firm.settings.onboarding.isComplete`.
 */
export async function isWorkspaceOnboardingComplete(firm: FirmOnboardingCheckRow): Promise<boolean> {
    const firmSettings = (firm.settings as Record<string, unknown> | null) ?? {}
    const onboarding = (firmSettings.onboarding as Record<string, unknown> | undefined) ?? {}
    const flowV = Number(onboarding.onboardingFlowVersion) || 1
    if (onboarding.isComplete === true) return true
    if (onboarding.stage === 'completed') return true
    // Flow v3 uses currentStep 3 for "connect stage reached / provisioning" — do not treat as finished.
    if (flowV < 3 && (onboarding.currentStep === 3 || onboarding.currentStep === 4)) return true

    // Sandbox firms (flow v3+) have no connector — onboarding is complete once they reach the
    // subscribe step (Step 2). Drive is connected per-client later, not during onboarding.
    if (firm.sandboxOnly && flowV >= 3) return true

    if (!firm.connectorId) return false

    const connector = await prisma.connector.findUnique({
        where: { id: firm.connectorId },
        select: { settings: true, status: true },
    })
    if (!connector || connector.status !== 'ACTIVE') return false

    const settings = (connector.settings as Record<string, unknown>) || {}
    const ob = settings.onboarding as Record<string, unknown> | undefined
    if (!ob || typeof ob !== 'object') return false

    if (ob.isComplete === true) return true

    // Sandbox: patchConnectorSandboxOnboardingProgress keeps isComplete false even after Drive + DB
    // hierarchy; finalizeSandboxDriveConnectorAndIndexing writes organizations[firmId].clientFolderIds.
    const orgs = settings.organizations as Record<string, Record<string, unknown>> | undefined
    const firmOrg = orgs?.[firm.id]
    const clientFolderIds = firmOrg?.clientFolderIds as Record<string, unknown> | undefined
    const hasMappedClients =
        clientFolderIds && typeof clientFolderIds === 'object' && Object.keys(clientFolderIds).length > 0

    const step = ob.currentStep
    const driveConnected = ob.driveConnected === true

    if (
        hasMappedClients &&
        driveConnected &&
        typeof step === 'number' &&
        step >= 3
    ) {
        return true
    }

    return false
}
