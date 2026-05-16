"use server"

import { SUGGESTED_WORKSPACE_FOLDER_NAME } from "@/lib/suggested-workspace-folder-name"

export async function getWorkspaceFolderName(): Promise<string> {
    return SUGGESTED_WORKSPACE_FOLDER_NAME
}
