import type { Metadata } from "next"

import { TrustCenterPage } from "@/components/marketing/v2/trust/trust-page"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"
import { TRUST_CENTER_PATH } from "@/lib/marketing/target-audience-nav"

const siteOrigin = getPlatformSiteOrigin()

const title = `Trust Center | ${BRAND_NAME}`
const description = `${BRAND_NAME} is non-custodial: your files stay in your own Drive, and ${BRAND_NAME} keeps only the structure (engagements, statuses, permissions and the audit log). See how it handles your data.`

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${siteOrigin}${TRUST_CENTER_PATH}`,
    siteName: BRAND_NAME,
    title,
    description,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `${BRAND_NAME} Trust Center` }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: `${siteOrigin}${TRUST_CENTER_PATH}`,
  },
}

export default function TrustPage() {
  return <TrustCenterPage />
}
