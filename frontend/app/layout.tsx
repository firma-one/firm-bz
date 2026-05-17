import './globals.css'
import { Inter, Space_Grotesk, Work_Sans } from 'next/font/google'
import type { Metadata } from 'next'
import Script from 'next/script'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import { CookieConsent } from '@/components/ui/cookie-consent'
import { ConsentAwareGoogleAnalytics } from '@/components/analytics/consent-aware-google-analytics'
import { BRAND_NAME, BRAND_NAME_TEAM } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { createClient } from '@/utils/supabase/server'
import type { Session } from '@supabase/supabase-js'

// Satoshi font via CDN fallback - using Inter as base with Satoshi-like styling
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
/** Kinetic / design1 nav labels (docs/design/design1) — applied in `Header` via `--font-header-label`. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-header-label',
  weight: ['500', '600', '700'],
  display: 'swap',
})

/** Work Sans — `--font-kinetic-body` for marketing / kinetic surfaces (see `globals.css` for headline alias). */
const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-kinetic-body',
  weight: ['300', '400', '500'],
  display: 'swap',
})

const siteTitle = `${BRAND_NAME} | Professional Client Portal atop Google Drive`
const siteOrigin = getPlatformSiteOrigin()

const defaultDescription =
  'Turn Google Drive into a professional client portal for marketing agencies, fractional leaders, consultants, and advisors. Secure, non-custodial file sharing. Protect Intellectual Property with time-bombed links and one-click revocation.'

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: siteTitle,
  description: defaultDescription,
  keywords: [
    'Client Portal',
    'Google Drive Portal',
    'Marketing Agency Client Portal',
    'Fractional CMO',
    'Secure File Sharing',
    'Consultant Tools',
    'Professional Services Automation',
    'Non-Custodial Security',
    'Document Management',
    'Time-Bombed Links',
    'Google Drive Integration',
    'Project Wrap',
    'Advisory Tools',
    'Virtual Data Room',
  ],
  authors: [{ name: BRAND_NAME_TEAM }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteOrigin,
    siteName: BRAND_NAME,
    title: siteTitle,
    description: defaultDescription,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} - Professional Client Portal`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: defaultDescription,
    images: ['/twitter-image.png'],
  },
  alternates: {
    canonical: siteOrigin,
  },
  category: 'technology',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Read session from cookie server-side — no network call, just JWT decode.
  // Passed to AuthProvider so the client skips its own getSession() round-trip,
  // which was causing AuthGuard to block rendering for 500ms–2s on Vercel.
  let initialSession: Session | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getSession()
    initialSession = data.session
  } catch {
    // fail silently — client AuthProvider will fall back to its own getSession()
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} ${spaceGrotesk.variable} ${workSans.variable} bg-gray-50 text-gray-900`}
        suppressHydrationWarning
      >
        {/* GA is loaded client-side only when analytics consent is granted (see ConsentAwareGoogleAnalytics). */}
        {/* JSON-LD for Search/Answer Engines */}
        {/* JSON-LD for Search/Answer Engines */}
        <script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": BRAND_NAME,
              "headline": "Turn Google Drive into a Professional Client Portal",
              "applicationCategory": "ProductivityApplication",
              "operatingSystem": "Web, Browser",
              "description": `${BRAND_NAME} helps marketing agencies, fractional executives, strategic consultants, and advisory partners create secure, white-labeled client portals from Google Drive folders without moving files—also used by audit, training, and consulting teams.`,
              "featureList": "Non-custodial file sharing, Client Portals, Marketing and advisory workflows, Project Wrap, Time-bombed links, Audit Logs",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
                "availability": "https://schema.org/OnlineOnly"
              },
              "author": {
                "@type": "Organization",
                "name": BRAND_NAME
              }
            })
          }}
        />
        {/* Force Unregister Service Workers and Handle Chunk Errors (Fix ChunkLoadError) */}
        <Script src="/fix-chunk-errors.js" strategy="beforeInteractive" />
        <AuthProvider initialSession={initialSession}>
          <ToastProvider>
            {children}
            <CookieConsent />
            <ConsentAwareGoogleAnalytics />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}