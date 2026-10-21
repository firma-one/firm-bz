import type { Metadata } from "next"
import type { ReactNode } from "react"

import { FAQ_DATA } from "@/data/faq-data"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()
const faqPath = "/resources/faq" as const
const faqUrl = `${siteOrigin}${faqPath}`

const faqTitle = `Frequently Asked Questions | ${BRAND_NAME}`
const faqDescription = `Answers about ${BRAND_NAME}'s client portal for marketing agencies, fractional executives, consultants, and advisors—Google Drive integration, security, Wrap, and multi-client engagements.`

export const metadata: Metadata = {
  title: faqTitle,
  description: faqDescription,
  keywords: [
    "FAQ",
    "client portal",
    "Google Drive",
    "marketing agency",
    "fractional CMO",
    "consultant tools",
    "non-custodial",
    "secure file sharing",
    BRAND_NAME,
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
    title: faqTitle,
    description: faqDescription,
    type: "website",
    url: faqUrl,
    siteName: BRAND_NAME,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - FAQ`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: faqTitle,
    description: faqDescription,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: faqUrl,
  },
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_DATA.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
}

/** Resources shell (v2) wraps this; the layout adds only the FAQPage structured data. */
export default function ResourcesFaqLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  )
}
