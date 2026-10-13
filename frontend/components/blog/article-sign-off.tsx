import { BRAND_NAME } from '@/config/brand'
import { cn } from '@/lib/utils'

const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

/**
 * Closing note shown under every blog article.
 *
 * This started as hand-copied markdown at the end of a few posts, which meant the
 * copy drifted per file and only appeared where someone had remembered to paste it.
 * It lives here so there is one copy of the sentence and every post gets it.
 */
export function ArticleSignOff({ className }: { className?: string }) {
  return (
    <div className={cn('mt-10 border-t border-[#eae7e9] pt-10', B, className)}>
      <p className="text-base leading-relaxed text-[#45474c] md:text-lg">
        {BRAND_NAME} turns the Google Drive or OneDrive you already use into a structured client
        delivery operating system. Files stay in your Drive, non-custodial by design.
      </p>
    </div>
  )
}
