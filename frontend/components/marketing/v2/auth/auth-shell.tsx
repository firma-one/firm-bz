/**
 * The page around the sign-in and sign-up cards (boards: SignIn, SignUp and their phone versions):
 * a white page with the dashed guides and a header hairline, the silk ribbon drawn live behind the
 * card, the logo home link, the card with its gray footer strip, and the legal links in a frosted pill.
 * Sign-up passes its value points as `aside`; they sit left of the card from 1024 px and below it
 * on smaller screens.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon';
import { BrandName } from '@/components/brand/BrandName';
import { BRAND_NAME } from '@/config/brand';
import { LegalLinks } from '../legal-links';
import { PageGuides } from '../primitives';
import { AuthRibbon } from './auth-ribbon';
import '../marketing-v2.css';
import './auth.css';

export function AuthShell({
  kind,
  aside,
  cardFooter,
  children,
}: {
  kind: 'signin' | 'signup';
  aside?: ReactNode;
  /** The gray strip under the card ("New to firmä? Create account"). */
  cardFooter: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`marketing-site mk mk-auth mk-auth--${kind}`}>
      <PageGuides />
      <div aria-hidden="true" className="mk-auth-hairline" />
      <AuthRibbon kind={kind} />

      <header className="mk-auth-header mk-rail">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="group mk-auth-logo">
          <BrandMarkIcon className="mk-auth-logo-icon" />
          <BrandName className="mk-auth-logo-name" />
        </Link>
      </header>

      <main id="main" className="mk-auth-main">
        <div className="mk-auth-card-col">
          <div className="mk-auth-card">
            <div className="mk-auth-card-body">{children}</div>
            <div className="mk-auth-card-foot">{cardFooter}</div>
          </div>
        </div>
        {aside ? <div className="mk-auth-aside">{aside}</div> : null}
      </main>

      <footer className="mk-auth-footer mk-rail">
        <LegalLinks tone="light" support />
      </footer>
    </div>
  );
}
