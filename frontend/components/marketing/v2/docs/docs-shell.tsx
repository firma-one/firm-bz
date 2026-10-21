/**
 * The docs layout on the reading template: one white band with the docs navigation in a sticky left
 * column (from 1024 px) beside the reading column; below 1024 px the navigation folds into a
 * disclosure above the page. The dark final CTA closes every docs page, as it closes every reading
 * page. The site header and footer come from the (resources) layout.
 */
import type { ReactNode } from 'react';
import { FinalCtaSection } from '../home/final-cta';
import { Band } from '../primitives';
import { DocsNav } from './docs-nav';
import './docs.css';

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Band surface="white" className="mk-docs">
        <div className="mk-rail mk-docs-grid-layout">
          <div className="mk-docs-side">
            <DocsNav variant="sidebar" />
          </div>
          <div className="mk-docs-main">
            <div className="mk-docs-only-narrow">
              <DocsNav variant="disclosure" />
            </div>
            <article className="mk-docs-article">{children}</article>
          </div>
        </div>
      </Band>
      <FinalCtaSection />
    </>
  );
}
