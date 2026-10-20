/** The quiet CTA card under "On this page" (after the article on smaller screens). */
import { BRAND_NAME } from '@/config/brand';
import { PillLink } from '../primitives';

export function ReadCtaCard({ className = '' }: { className?: string }) {
  return (
    <div className={`mk-read-cta-card ${className}`}>
      <p className="mk-read-cta-title">Deliver, don’t just share.</p>
      <p className="mk-read-cta-copy">
        {BRAND_NAME} turns your Drive into a branded client workspace: one home for every deliverable, and access you
        control.
      </p>
      <PillLink href="/signup" size="sm" className="mk-read-cta-btn">
        Start free
      </PillLink>
      <p className="mk-read-cta-note">Free for your first client · No credit card</p>
    </div>
  );
}
