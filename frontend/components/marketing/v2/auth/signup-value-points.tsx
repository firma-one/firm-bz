/**
 * Sign-up's four value points (SignUp board). Each is marked by a thin bottle-green bar that sits on
 * the page's first guide line; the points rise in one after another and each bar grows down after
 * its point arrives.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';

const POINTS: { title: ReactNode; body: string }[] = [
  {
    title: 'Built on your own Drive',
    body: `Connect Google Drive or OneDrive. Your files stay where they are, and ${BRAND_NAME} never stores a copy.`,
  },
  {
    title: 'Every engagement in one place',
    body: 'Deliverables on a Board, approvals in one thread, and a branded view for each client.',
  },
  {
    title: (
      <>
        <Brio fixedColor iconClassName="mk-sparkle" />, your delivery assistant
      </>
    ),
    body: 'Briefs you each day, answers questions and drafts the client update. It never acts without you.',
  },
  {
    title: 'Free for your first client',
    body: 'No credit card. Two users and 25 Brio credits a month to start.',
  },
];

export function SignupValuePoints() {
  return (
    <ul className="mk-auth-points m-0 list-none p-0" aria-label={`Why ${BRAND_NAME}`}>
      {POINTS.map((point, i) => (
        <li key={i} className="mk-auth-point" style={{ '--mk-delay': `${260 + i * 120}ms` } as CSSProperties}>
          <span aria-hidden="true" className="mk-auth-point-bar" />
          <h2 className="mk-auth-point-title">{point.title}</h2>
          <p className="mk-auth-point-body">{point.body}</p>
        </li>
      ))}
    </ul>
  );
}
