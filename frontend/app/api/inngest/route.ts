import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
    revokeProjectSharing,
    revokeByDisabledPersona,
    revokeByMemberPersonaChange,
    grantPermissionsForNewMember,
    indexFileForSearch,
    indexBatchForSearch,
    scanAndIndexProject,
    populateSandboxSampleFiles,
    provisionSandboxHierarchy,
    reconcileFileDeletion,
    reconcileFolderDeletion,
    migrateWorkspaceRoot,
    platformMaintenanceActivate,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        revokeProjectSharing,
        revokeByDisabledPersona,
        revokeByMemberPersonaChange,
        grantPermissionsForNewMember,
        indexFileForSearch,
        indexBatchForSearch,
        scanAndIndexProject,
        populateSandboxSampleFiles,
        provisionSandboxHierarchy,
        reconcileFileDeletion,
        reconcileFolderDeletion,
        migrateWorkspaceRoot,
        platformMaintenanceActivate,
    ],
});
