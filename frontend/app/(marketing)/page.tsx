import type { Metadata } from "next"

import { HomePageV2 } from "@/components/marketing/v2/home/home-page"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const homeTitle = `${BRAND_NAME} | Run every client engagement from your own Drive`
const homeDescription = `${BRAND_NAME} turns the Google Drive or OneDrive you already use into a client workspace: every deliverable on a Board, every approval in one thread, and Brio, the assistant for client delivery. Your files never leave your Drive.`

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  keywords: [
    "Client Portal",
    "Google Drive Portal",
    "Marketing Agency Client Portal",
    "Fractional CMO",
    "Fractional Executive Tools",
    "Strategic Consultants",
    "Advisory Client Portal",
    "Secure File Sharing",
    "Non-Custodial Security",
    "Google Drive Integration",
    "OneDrive Client Portal",
    "AI Assistant for Client Delivery",
    "Professional Services Automation",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteOrigin,
    siteName: BRAND_NAME,
    title: homeTitle,
    description: homeDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Professional Client Portal`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: siteOrigin,
  },
}

export default function MarketingHomePage() {
  return <HomePageV2 />
}
