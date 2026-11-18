import type { Metadata } from 'next'
import { BRAND_NAME } from '@/config/brand'
import { SecureOpenHoldingPage } from '@/components/secure-open/holding-page'

// The tab a secure open shows while access is checked (lib/secure-open/holding-tab.ts). No server
// work and no data: what it shows comes from its hash and the opening tab.
export const metadata: Metadata = {
    title: `Opening a document · ${BRAND_NAME}`,
    robots: { index: false, follow: false },
}

export default function SecureOpenPage() {
    return <SecureOpenHoldingPage />
}
