import { MarketingPage } from '@/components/marketing/v2/marketing-page'

/**
 * Marketing route group: the v2 site shell (the green system's tokens, the fixed header, the footer,
 * and today's date for the product scenes). Pages render their content only.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingPage>{children}</MarketingPage>
}
