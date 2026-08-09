/** Thrown by shareConnectorWithClient (lib/actions/client.ts) when the client link itself
 *  succeeded but Drive folder provisioning failed afterward — lets the caller distinguish
 *  "nothing happened" from "linked, but with a problem" so it can update local UI state
 *  correctly instead of showing the client as unattached when it's actually attached.
 *
 *  Lives in its own plain (non "use server") module because "use server" files may only
 *  export async functions — a class export there fails the Next.js build. */
export class ClientLinkedFolderFailedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ClientLinkedFolderFailedError'
    }
}
