import '@/components/marketing/v2/marketing-v2.css'

/**
 * Campaign pages (/go/*): the marketing site's tokens without its navigation, since each campaign page
 * carries its own minimal brand bar and a single call to action.
 */
export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing-site mk min-h-screen">{children}</div>
}
