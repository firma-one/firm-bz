/**
 * Resources (blog, docs, FAQ, changelog, trust center) share the marketing site's look:
 * `.marketing-site` keeps their heading color (app/ui-tokens.css). `display: contents` leaves
 * each section's own layout untouched — custom properties still inherit through it.
 */
export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing-site contents">{children}</div>
}
