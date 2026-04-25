import type { Metadata } from "next"
import { AudienceLanding } from "@/components/landing/audience-landing"
import { agencyContent } from "@/lib/marketing/audience-content"
import { getPostsByAudienceId } from "@/lib/blog-utils"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const title = `Marketing Agency Client Portal | Premium Client Delivery Platform | ${BRAND_NAME}`
const description = `Transform client delivery with a branded, professional portal. Reduce churn, raise rates, and stand out from commodity agencies. Show clients the value of your work—not as emails and PDFs, but as premium, organized deliverables.`

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Marketing agency portal",
    "Client delivery platform",
    "Agency client portal",
    "Marketing deliverables",
    "Client engagement platform",
    "Agency white-label solution",
    "Client reporting portal",
    "Campaign management platform",
    "Agency workspace",
    "Professional services delivery",
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
    url: `${siteOrigin}/landing/marketing-agencies`,
    siteName: BRAND_NAME,
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Marketing Agency Client Portal`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: `${siteOrigin}/landing/marketing-agencies`,
  },
}

export default function MarketingAgenciesPage() {
  const blogPosts = getPostsByAudienceId("marketing-agencies")

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: agencyContent.faqs.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.a,
              },
            })),
          }),
        }}
      />
      <AudienceLanding content={agencyContent} blogPosts={blogPosts} />
    </>
  )
}
