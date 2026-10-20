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

/** `icon` is for the phone menu, where a plain header link sits in a group beside dropdown entries. */
export type NavLink = { label: string; href: string; brio?: boolean; icon?: NavMenuItem['icon'] };

/** An entry in a header dropdown: an icon (named, drawn by the nav), a title and one line of description. */
export type NavMenuItem = {
  label: string;
  href: string;
  description: string;
  icon: 'flow' | 'features' | 'brio' | 'drive' | 'people' | 'tour' | 'pricing' | 'faq' | 'blog' | 'changelog' | 'trust' | 'mail' | 'calendar';
  external?: boolean;
};

export type NavMenuId = 'product' | 'resources' | 'contact';

export const NAV_MENUS: Record<NavMenuId, { label: string; items: NavMenuItem[] }> = {
  product: {
    label: 'Product',
    items: [
      { label: 'How it works', href: '/#product', icon: 'flow', description: 'From your folders to a Board your client can follow.' },
      { label: 'Features', href: '/#features', icon: 'features', description: 'Approvals, reminders, the audit trail, Doc Search and more.' },
      { label: 'Brio', href: '/#brio', icon: 'brio', description: 'The assistant for client delivery, built in.' },
      { label: 'Built on your Drive', href: '/#drive', icon: 'drive', description: 'Your files never leave Google Drive or OneDrive.' },
      { label: 'Who it’s for', href: '/#who-its-for', icon: 'people', description: 'Consultancies, agencies and fractional leaders.' },
      { label: 'Take the tour', href: '/tour', icon: 'tour', description: 'A demo firm in the real product. No account needed.' },
    ],
  },
  resources: {
    label: 'Resources',
    items: [
      { label: 'FAQs', href: '/resources/faq', icon: 'faq', description: 'Common questions and answers about firmä.' },
      { label: 'Blog', href: '/resources/blog', icon: 'blog', description: 'Insights, guides, and best practices for client portals.' },
      { label: 'Changelog', href: '/resources/changelog', icon: 'changelog', description: 'New features, fixes, and improvements in every release.' },
      { label: 'Trust Center', href: '/resources/trust-center', icon: 'trust', description: 'How firmä keeps your files and your clients’ data safe.' },
    ],
  },
  contact: {
    label: 'Contact',
    items: [
      { label: 'Get in touch', href: '/contact', icon: 'mail', description: 'Send a message to our team through the contact form.' },
      { label: 'Book a demo', href: DEMO_BOOKING_URL, icon: 'calendar', description: 'Pick a time on Calendly for a live walkthrough.', external: true },
    ],
  },
};

/**
 * The header, left to right: dropdown menus and plain links. Brio and the tour live in Product (the
 * tour is also the hero's second button), so neither repeats in the bar.
 */
export const NAV_BAR: ({ kind: 'menu'; id: NavMenuId } | ({ kind: 'link' } & NavLink))[] = [
  { kind: 'menu', id: 'product' },
  { kind: 'link', label: 'Pricing', href: '/pricing', icon: 'pricing' },
  { kind: 'menu', id: 'resources' },
  { kind: 'menu', id: 'contact' },
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
];
