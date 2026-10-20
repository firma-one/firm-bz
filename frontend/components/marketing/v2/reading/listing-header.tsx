/**
 * Listing header (blog index and category pages): breadcrumb, the page-token headline and a lede,
 * on white with the page guides. Its top padding clears the fixed header (64 px phone, 76 px desktop).
 */
import type { ReactNode } from 'react';
import { PageGuides } from '../primitives';
import { ReadBreadcrumb, type Crumb } from './breadcrumb';
import './reading.css';

export function ListingHeader({ crumbs, title, lede }: { crumbs: Crumb[]; title: ReactNode; lede: ReactNode }) {
  return (
    <div className="mk-band mk-band--white">
      <PageGuides />
      <header className="mk-rail mk-read-listhead relative">
        <ReadBreadcrumb items={crumbs} current />
        <h1 className="mk-page mk-read-listtitle">{title}</h1>
        <p className="mk-lede mk-read-listlede">{lede}</p>
      </header>
    </div>
  );
}
