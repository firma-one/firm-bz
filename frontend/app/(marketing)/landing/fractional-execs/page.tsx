import type { Metadata } from "next"
import { AudiencePageV2 } from "@/components/marketing/v2/audience/audience-page"
import { fractionalExecsContent } from "@/lib/marketing/audience-content"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

// The page for every fractional leadership role; /landing/fractional-cmos is the CMO-specific page.
const execsTitle = `Fractional Executive Client Portal | CFO, COO, CMO, CISO and More | ${BRAND_NAME}`
const execsDescription = `A client portal for every fractional leader: CFOs, COOs, CMOs, CISOs and more. Give each client one professional, branded workspace for strategy docs, reports and deliverables, with your files kept in your own Google Drive.`

export const metadata: Metadata = {
  title: execsTitle,
  description: execsDescription,
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
    url: `${siteOrigin}/landing/fractional-execs`,
    siteName: BRAND_NAME,
    title: execsTitle,
    description: execsDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Fractional Executive Client Portal`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: execsTitle,
    description: execsDescription,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: `${siteOrigin}/landing/fractional-execs`,
  },
}

export default function FractionalExecsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: fractionalExecsContent.faqs.map((faq) => ({
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
      <AudiencePageV2 content={fractionalExecsContent} />
    </>
  )
}
