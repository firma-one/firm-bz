import type { Metadata } from "next"

import { PricingPageV2 } from "@/components/marketing/v2/pricing/pricing-page"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const title = `Pricing | ${BRAND_NAME}`
const description = `Pricing that grows with your clients, not your headcount. Unlimited members on every paid plan, Brio included on every plan, and a free plan for your first client.`

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${siteOrigin}/pricing`,
    siteName: BRAND_NAME,
    title,
    description,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `${BRAND_NAME} pricing` }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: `${siteOrigin}/pricing`,
  },
}

export default function PricingPage() {
  return <PricingPageV2 />
}
