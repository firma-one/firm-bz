import { MarketingPage } from '@/components/marketing/v2/marketing-page'

/** Resources (blog, docs, FAQ, changelog, trust center) live in the marketing site's shell. */
export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return <MarketingPage>{children}</MarketingPage>
}
