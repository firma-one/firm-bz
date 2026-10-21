/**
 * The small row of legal links: © year, Privacy, Terms, Cookie settings, and optionally Support.
 * One component for every page that ends with one, so they read and behave the same:
 *
 * - `light` sits in a frosted pill, centered, for the sign-in and sign-up pages, where it can fall
 *   over the silk ribbon and must stay legible.
 * - `dark` is the bare row at the start of the site footer's bottom bar.
 *
 * Each link is a soft pill on hover with a full-height hit area, and the dots between them are
 * decoration only (screen readers hear a plain list).
 */
import Link from 'next/link';
import { BRAND_NAME } from '@/config/brand';
import { CookieSettingsLink } from './cookie-settings-link';

export function LegalLinks({ tone, support = false }: { tone: 'light' | 'dark'; support?: boolean }) {
  return (
    <nav aria-label="Legal" className={`mk-legal mk-legal--${tone}`}>
      <ul>
        <li className="mk-legal-copy">
          © {new Date().getFullYear()} {BRAND_NAME}
        </li>
        <li>
          <Link href="/privacy" className="mk-legal-link">
            Privacy
          </Link>
        </li>
        <li>
          <Link href="/terms" className="mk-legal-link">
            Terms
          </Link>
        </li>
        <li>
          <CookieSettingsLink className="mk-legal-link" />
        </li>
        {support && (
          <li>
            <Link href="/contact" className="mk-legal-link">
              Support
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
