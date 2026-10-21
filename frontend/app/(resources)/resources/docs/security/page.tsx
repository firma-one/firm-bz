import { EyeOff, FileCheck, Lock, Server } from "lucide-react"
import { BRAND_NAME } from "@/config/brand"
import { DocsBox, DocsGrid, DocsHeader, DocsSection, DocsTile } from "@/components/marketing/v2/docs/docs-blocks"

const ICON = { size: 18, strokeWidth: 2.2, "aria-hidden": true } as const

export default function SecurityDocsPage() {
    return (
        <>
            <DocsHeader section="Resources" title="Security & Privacy">
                At {BRAND_NAME}, we prioritize the confidentiality and integrity of your data.
                Our architecture is designed to act as a secure pass-through, ensuring that your files
                are never stored on our infrastructure.
            </DocsHeader>

            <div className="mk-docs-section">
                <DocsGrid cols={2}>
                    <DocsTile tone="white" icon={<Server {...ICON} />} title="Zero-Storage Policy">
                        We do not persist your files. When you access or download a document,
                        it streams entirely through our server&apos;s volatile memory (RAM) and is
                        immediately discarded after delivery.
                    </DocsTile>
                    <DocsTile tone="green" icon={<Lock {...ICON} />} title="Encrypted in Transit">
                        All data transmission occurs over encrypted channels.
                        From Google Drive to our servers, and from our servers to your browser,
                        your data is protected by industry-standard TLS encryption.
                    </DocsTile>
                </DocsGrid>

                <DocsBox title="Secure Download Architecture">
                    <p>
                        When you initiate a file download, {BRAND_NAME} establishes a secure tunnel.
                        The file content is streamed directly from Google&apos;s secure servers to your device.
                        This process ensures that no complete file is ever written to our disks, maintaining strict data hygiene.
                    </p>
                </DocsBox>
            </div>

            <DocsSection title="Data Access & Control">
                <DocsGrid cols={2}>
                    <DocsTile tone="gray" icon={<EyeOff {...ICON} />} title="Token Security">
                        Your Google Drive access tokens are encrypted at rest in our database
                        and are never exposed to the client-side browser.
                    </DocsTile>
                    <DocsTile tone="gray" icon={<FileCheck {...ICON} />} title="Granular Permissions">
                        We only request the permissions strictly necessary to list and download your files.
                        You can revoke access at any time from your Google Account settings or the {BRAND_NAME} dashboard.
                    </DocsTile>
                </DocsGrid>
            </DocsSection>
        </>
    )
}
