/** Unused since 2026-11-08: shareConnectorWithClient now answers an ActionResult with a `warning` for this case, because
 *  a class thrown from a server action never survives to the browser (lib/actions/action-result.ts). Kept until Deepak
 *  signs off on removing it.
 *
 *  Thrown by shareConnectorWithClient (lib/actions/client.ts) when the client link itself
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
