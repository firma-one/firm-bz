import type { Metadata } from "next"
import { AudienceLanding } from "@/components/landing/audience-landing"
import { fulltimeCMOContent } from "@/lib/marketing/audience-content"
import { getPostsByAudienceId } from "@/lib/blog-utils"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const title = `Fulltime CMO Alignment Platform | Unite Your Team Around Strategy | ${BRAND_NAME}`
const description = `Give your entire marketing team and leadership one unified workspace for strategy, execution, and alignment. Make your strategy visible. Prove your impact. Speed up decision-making.`

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Fulltime CMO",
    "Marketing strategy alignment",
    "Team collaboration portal",
    "Marketing strategy workspace",
    "Internal strategy platform",
    "Cross-functional alignment",
    "Marketing execution tracking",
    "Strategy visibility",
    "Team coordination tool",
    "Marketing leadership",
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
    url: `${siteOrigin}/landing/fulltime-cmos`,
    siteName: BRAND_NAME,
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Fulltime CMO Alignment Platform`,
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
    canonical: `${siteOrigin}/landing/fulltime-cmos`,
  },
}

export default function FulltimeCMOPage() {
  const blogPosts = getPostsByAudienceId("fulltime-cmo")

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: fulltimeCMOContent.faqs.map((faq) => ({
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
      <AudienceLanding content={fulltimeCMOContent} blogPosts={blogPosts} />
    </>
  )
}
