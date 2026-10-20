/**
 * Marketing site v2: switches, links and copy shared across the new pages.
 */

/**
 * Proposal decision 7: the "Tidy the files" moment (Brio's Files agent) shows only once the Files agent
 * has passed its combined test pass and is released to every firm. Until then the 4:30 moment is
 * "Ask Brio on Files".
 */
export const FILES_AGENT_PUBLIC = false;

export const DEMO_BOOKING_URL = 'https://calendly.com/firmaone/firma-connect';
export const CONTACT_EMAIL = 'info@firmaone.com';

export type NavLink = { label: string; href: string; brio?: boolean };

export const HEADER_LINKS: NavLink[] = [
  { label: 'Product', href: '/#product' },
  { label: 'Brio', href: '/#brio', brio: true },
  { label: 'Tour', href: '/tour' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/resources/blog' },
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Tour', href: '/tour' },
      { label: 'Brio', href: '/#brio', brio: true },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Trust Center', href: '/resources/trust-center' },
      { label: 'Changelog', href: '/resources/changelog' },
    ],
  },
  {
    title: 'Who it’s for',
    links: [
      { label: 'Agencies', href: '/landing/marketing-agencies' },
      { label: 'Fractional execs', href: '/landing/fractional-execs' },
      { label: 'In-house CMOs', href: '/landing/fulltime-cmos' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/resources/blog' },
      { label: 'FAQ', href: '/resources/faq' },
      { label: 'Contact', href: '/contact' },
      { label: 'Book a demo', href: DEMO_BOOKING_URL },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Cookie settings', href: '/privacy#cookies' },
    ],
  },
];
