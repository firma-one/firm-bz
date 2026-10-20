import { PageGuides, PillLink } from '@/components/marketing/v2/primitives'

export default function MarketingNotFound() {
  return (
    <section className="mk-band mk-band--white flex min-h-[78vh] items-center pb-24 pt-32">
      <PageGuides />
      <div className="mk-rail relative w-full text-center">
        <p
          className="select-none text-[96px] font-bold leading-none tracking-[-0.05em] text-[var(--mk-bottle)] md:text-[140px]"
          style={{ fontFamily: 'var(--mk-font-display)' }}
        >
          404
        </p>
        <h1 className="mk-section mt-4 text-[var(--mk-ink)]">Page not found</h1>
        <p className="mk-lede mx-auto mt-4 max-w-md">This page has moved or doesn’t exist.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/">Back to home</PillLink>
          <PillLink href="/resources/blog" variant="secondary">
            Read the blog
          </PillLink>
        </div>
      </div>
    </section>
  )
}
