/**
 * The shell of every v2 marketing page: the `.mk` token scope, the fixed header, the footer, and the
 * demo-dates provider for product scenes.
 * Used by the (marketing) and (resources) route-group layouts; the header is fixed, so each page's
 * first section clears it (64 px on phones, 76 px from md).
 */
import type { ReactNode } from 'react';
import './marketing-v2.css';
import { DemoDatesProvider } from './demo-dates-context';
import { serverDay } from './demo-dates';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-site mk relative min-h-screen">
      <DemoDatesProvider day={serverDay()}>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </DemoDatesProvider>
    </div>
  );
}
