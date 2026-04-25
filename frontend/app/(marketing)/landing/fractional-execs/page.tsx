import type { Metadata } from "next"
import { FractionalCMOLanding } from "@/components/landing/fractional-cmo-landing"
import { BRAND_NAME } from "@/config/brand"
import { getPlatformSiteOrigin } from "@/config/platform-domain"

const siteOrigin = getPlatformSiteOrigin()

const cmoTitle = `Fractional CMO Client Portal | Show Clients the Value of Your Work | ${BRAND_NAME}`
const cmoDescription = `Help fractional CMOs deliver client work with impact. Transform how clients perceive your strategy through a professional, dedicated portal. Monthly reports, campaign dashboards, and strategy presentations—all in one place.`

export const metadata: Metadata = {
  title: cmoTitle,
  description: cmoDescription,
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
    title: cmoTitle,
    description: cmoDescription,
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
    title: cmoTitle,
    description: cmoDescription,
    images: ["/twitter-image.png"],
  },
  alternates: {
    canonical: `${siteOrigin}/landing/fractional-execs`,
  },
}

export default function FractionalCMOPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "How does Firma help fractional CMOs present work to clients?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Firma provides a professional, branded client portal where fractional CMOs can present their work with context and narrative. Instead of sending raw Drive links or PDF emails, clients see a structured, polished presentation of your strategy, reports, and performance data—making your work more visible and valuable.",
                },
              },
              {
                "@type": "Question",
                name: "What's included in the monthly marketing report portal?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The monthly marketing report portal is a live, interactive workspace where clients can view their campaign performance, strategic insights, and actionable recommendations. It replaces static PDFs with a dynamic experience that keeps clients engaged and aware of the value you're delivering.",
                },
              },
              {
                "@type": "Question",
                name: "Do clients need to create a login?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, but onboarding takes less than 1 minute. You send them an invite email link. They click it, set up their login instantly (no password reset emails or complexity), and they're in. Frictionless first-time access.",
                },
              },
              {
                "@type": "Question",
                name: "How do I track which clients have viewed my reports?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Firma provides an audit trail showing when clients access documents, which pages they view, and how long they spend in the portal. This gives you visibility into client engagement and helps you understand which recommendations are being reviewed.",
                },
              },
              {
                "@type": "Question",
                name: "Is it safe to share confidential strategy docs through Firma?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Absolutely. Firma uses non-custodial architecture, meaning your files stay in your Google Drive and you maintain full control. You can tag sensitive frameworks as 'Never Share,' set access expiration dates, and revoke access instantly. All data is encrypted in transit and at rest.",
                },
              },
              {
                "@type": "Question",
                name: "Can I customize the portal with my branding?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. Firma is fully white-labeled, so clients see your brand, logo, and custom domain. The Firma product stays in the background, making it feel like a proprietary tool built just for your firm.",
                },
              },
              {
                "@type": "Question",
                name: "How long does it take to set up a client portal?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Setup takes minutes. Connect your Google Drive, select the folders you want to share, map them to client projects, and you're done. No technical skills required—the interface is intuitive and self-guided.",
                },
              },
              {
                "@type": "Question",
                name: "What happens to the portal when an engagement ends?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "When an engagement is complete, you can use the 'Wrap' feature to instantly convert the portal to view-only, package deliverables for archival, and revoke all client access. Everything is cleaned up in one click.",
                },
              },
              {
                "@type": "Question",
                name: "Do I need technical skills to use Firma?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. Firma is designed for non-technical users. The setup is guided, the interface is intuitive, and support is available if you need it. You don't need to manage servers, code, or infrastructure.",
                },
              },
              {
                "@type": "Question",
                name: "How does Firma compare to sending reports via email or Drive links?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Email and Drive links feel transactional and impersonal—clients often miss updates or lose context. Firma creates a dedicated, branded workspace that feels premium and intentional. Clients see your work is organized, professional, and valued. Plus, you get visibility into engagement and can update content in real-time without sending new emails.",
                },
              },
            ],
          }),
        }}
      />
      <FractionalCMOLanding />
    </>
  )
}
