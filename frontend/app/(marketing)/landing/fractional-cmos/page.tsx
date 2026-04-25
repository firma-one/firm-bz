import type { Metadata } from "next"
import { AudienceLanding } from "@/components/landing/audience-landing"
import { fractionalCMOContent } from "@/lib/marketing/audience-content"
import { getPostsByAudienceId } from "@/lib/blog-utils"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const title = `Fractional CMO Client Portal | Show Clients the Value of Your Work | ${BRAND_NAME}`
const description = `Help fractional CMOs deliver client work with impact. Transform how clients perceive your strategy through a professional, dedicated portal. Monthly reports, campaign dashboards, and strategy presentations—all in one place.`

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Fractional CMO",
    "Marketing report portal",
    "Client deliverables",
    "CMO workspace",
    "Marketing consulting platform",
    "Client portal for CMOs",
    "Monthly marketing reports",
    "Strategy presentation tool",
    "Fractional marketing executive",
    "Professional services portal",
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
    url: `${siteOrigin}/landing/fractional-cmos`,
    siteName: BRAND_NAME,
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Fractional CMO Client Portal`,
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
    canonical: `${siteOrigin}/landing/fractional-cmos`,
  },
}

export default function FractionalCMOPage() {
  const blogPosts = getPostsByAudienceId("fractional-cmo")

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: fractionalCMOContent.faqs.map((faq) => ({
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
      <AudienceLanding content={fractionalCMOContent} blogPosts={blogPosts} />
    </>
  )
}
