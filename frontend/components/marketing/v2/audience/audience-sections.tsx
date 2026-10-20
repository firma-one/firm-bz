/**
 * The audience-specific sections of a /landing/* page, built from the home page's parts:
 *
 * - `AudienceChallenge` (gray): the pain points as cards beside "what most do".
 * - `AudiencePrinciples` (dark, slanted): the three principles every audience page shares.
 * - `AudienceShift` (white): without and with, side by side, and the line that sums it up.
 * - `AudienceImpact` (gray): the outcomes as icon cards.
 * - `AudienceFaq`: the page's questions with the home FAQ's disclosures (the page renders the FAQPage
 *   JSON-LD from the same list).
 * - `AudienceReading` (gray): related posts on the reading pages' cards.
 *
 * Server components; the cards (MkCard) and disclosures (FaqItem) are the client islands. The ✕ and ✓
 * markers and the card tiles pop in on a card's first scroll-in; the copy never waits on script.
 */
import type { ReactNode } from 'react';
import { Check, CircleCheck, CircleDollarSign, FolderLock, Palette, ShieldCheck, TriangleAlert, Users, X } from 'lucide-react';
import type { AudienceContent } from '@/lib/marketing/audience-content';
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav';
import { FaqItem } from '../home/faq-item';
import { MkCard } from '../motion';
import { Band, ChevronLink, Eyebrow, revealDelay } from '../primitives';
import type { PostCardData } from '../reading/format';
import { PostCard } from '../reading/post-card';
import '../home/faq.css';
import '../reading/reading.css';
import './audience.css';

/** "The Problem: Great Work, Invisible Value": the part before the colon in ink, the rest in bottle green. */
function SectionTitle({ text }: { text: string }) {
  const i = text.indexOf(': ');
  if (i === -1) return <>{text}</>;
  return (
    <>
      <span className="mk-aud-h2-lead">{text.slice(0, i + 1)}</span> {text.slice(i + 2)}
    </>
  );
}

function SectionHead({ id, eyebrow, title, lede }: { id: string; eyebrow?: string; title: string; lede?: ReactNode }) {
  return (
    <>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mk-section mk-aud-h2">
        <SectionTitle text={title} />
      </h2>
      {lede && <p className="mk-aud-lede">{lede}</p>}
    </>
  );
}

function Mark({ yes, delay }: { yes: boolean; delay: number }) {
  return (
    <span aria-hidden="true" className={`mk-aud-mark mk-aud-mark--${yes ? 'yes' : 'no'} mk-reveal mk-reveal--pop`} style={revealDelay(delay)}>
      {yes ? <Check size={13} strokeWidth={3.2} /> : <X size={12} strokeWidth={3} />}
    </span>
  );
}

/* ── The challenge ────────────────────────────────────────────────────────────────────────── */

export function AudienceChallenge({ content }: { content: AudienceContent }) {
  return (
    <Band surface="gray" aria-labelledby="mk-aud-challenge-title" className="mk-aud-band">
      <div className="mk-rail">
        <SectionHead
          id="mk-aud-challenge-title"
          eyebrow="THE CHALLENGE"
          title={content.problemTitle}
          lede="Most professionals deliver great work, but clients often don't see the full value of what they've received."
        />
        <div className="mk-aud-challenge">
          <ul className="mk-aud-problems">
            {content.problems.map((problem, i) => (
              <MkCard key={problem} as="li" className="mk-aud-card mk-aud-problem">
                <span aria-hidden="true" className="mk-aud-tile mk-aud-num mk-reveal mk-reveal--pop" style={revealDelay(120)}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="mk-aud-problem-text mk-card-title-wrap">{problem}</p>
              </MkCard>
            ))}
          </ul>
          <MkCard className="mk-aud-card mk-aud-usual">
            <h3 className="mk-aud-card-title mk-card-title-wrap">{content.problemBoxTitle}</h3>
            <ul className="mk-aud-list">
              {content.problemBoxItems.map((item, i) => (
                <li key={item}>
                  <Mark yes={false} delay={200 + i * 140} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </MkCard>
        </div>
      </div>
    </Band>
  );
}

/* ── Principles ───────────────────────────────────────────────────────────────────────────── */

const PRINCIPLES = [
  {
    icon: FolderLock,
    title: 'Your Drive, Your Control',
    body: "Files stay in YOUR Google Drive. We don't store them. You control who sees what and revoke access instantly. Full control, zero compromise.",
  },
  {
    icon: Users,
    title: 'All Stakeholders, One Platform',
    body: 'No more scattered emails, Drive links, or version confusion. Everyone—team and clients—converges on a single, professional workspace. Organized, unified, white-glove experience.',
  },
  {
    icon: Palette,
    title: 'Branded & Professional',
    body: 'Your logo, your colors, your domain. Clients see YOUR premium workspace, not a generic folder. Same work, completely different perception.',
  },
];

export function AudiencePrinciples() {
  return (
    <Band surface="dark" slant="both" aria-labelledby="mk-aud-principles-title" className="mk-aud-principles">
      <div className="mk-rail">
        <SectionHead
          id="mk-aud-principles-title"
          title="Built for Control & Collaboration"
          lede="Three core principles that transform how you deliver and collaborate with clients."
        />
        <ul className="mk-aud-grid mk-aud-grid--3">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <MkCard key={title} as="li" className="mk-aud-card mk-aud-glass mk-aud-feature">
              <span aria-hidden="true" className="mk-aud-tile mk-reveal mk-reveal--pop" style={revealDelay(120)}>
                <Icon size={22} strokeWidth={2} />
              </span>
              <div className="mk-card-title-wrap">
                <h3 className="mk-aud-card-title">{title}</h3>
                <p className="mk-aud-card-body">{body}</p>
              </div>
            </MkCard>
          ))}
        </ul>
      </div>
    </Band>
  );
}

/* ── The shift ────────────────────────────────────────────────────────────────────────────── */

export function AudienceShift({ content }: { content: AudienceContent }) {
  return (
    <Band surface="white" aria-labelledby="mk-aud-shift-title" className="mk-aud-band">
      <div className="mk-rail">
        <SectionHead
          id="mk-aud-shift-title"
          eyebrow="THE SHIFT"
          title={content.perceptionShiftTitle}
          lede="See how Firma changes the perception of your work from invisible to invaluable."
        />
        <div className="mk-aud-shift">
          <MkCard className="mk-aud-card mk-aud-without">
            <h3 className="m-0">
              <span className="mk-aud-shift-tag">Without Firma</span>
            </h3>
            <ul className="mk-aud-list">
              {content.perceptionShiftWithout.map((item, i) => (
                <li key={item}>
                  <Mark yes={false} delay={200 + i * 110} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </MkCard>
          <MkCard className="mk-aud-card mk-aud-with">
            <h3 className="m-0">
              <span className="mk-aud-shift-tag">With Firma</span>
            </h3>
            <ul className="mk-aud-list">
              {content.perceptionShiftWith.map((item, i) => (
                <li key={item}>
                  <Mark yes delay={360 + i * 110} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </MkCard>
        </div>
        <p className="mk-aud-shift-close">{content.perceptionShiftCta}</p>
      </div>
    </Band>
  );
}

/* ── Impact ───────────────────────────────────────────────────────────────────────────────── */

const IMPACT_ICONS = {
  dollar: CircleDollarSign,
  alert: TriangleAlert,
  shield: ShieldCheck,
  checkmark: CircleCheck,
} satisfies Record<AudienceContent['businessImpacts'][number]['icon'], unknown>;

export function AudienceImpact({ content }: { content: AudienceContent }) {
  const columns = content.businessImpacts.length === 3 ? 3 : 4;
  return (
    <Band surface="gray" aria-labelledby="mk-aud-impact-title" className="mk-aud-band">
      <div className="mk-rail">
        <SectionHead
          id="mk-aud-impact-title"
          eyebrow="THE IMPACT"
          title={content.businessImpactTitle}
          lede="Real benefits that compound over time as you transform how clients perceive your work."
        />
        <ul className={`mk-aud-grid mk-aud-grid--${columns}`}>
          {content.businessImpacts.map((impact) => {
            const Icon = IMPACT_ICONS[impact.icon];
            return (
              <MkCard key={impact.title} as="li" className="mk-aud-card mk-aud-feature">
                <span aria-hidden="true" className="mk-aud-tile mk-reveal mk-reveal--pop" style={revealDelay(120)}>
                  <Icon size={22} strokeWidth={2} />
                </span>
                <div className="mk-card-title-wrap">
                  <h3 className="mk-aud-card-title">{impact.title}</h3>
                  <p className="mk-aud-card-body">{impact.description}</p>
                </div>
              </MkCard>
            );
          })}
        </ul>
      </div>
    </Band>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────────────────────── */

export function AudienceFaq({ faqs }: { faqs: AudienceContent['faqs'] }) {
  return (
    <Band surface="white" aria-labelledby="mk-aud-faq-title" className="mk-aud-band">
      <div className="mk-rail">
        <SectionHead id="mk-aud-faq-title" eyebrow="FAQ" title="Frequently Asked Questions" />
        <div className="mk-faq-teaser-grid mk-aud-faq-grid mt-9 md:mt-12">
          {faqs.map((faq) => (
            <FaqItem key={faq.q} question={faq.q}>
              <p>{faq.a}</p>
            </FaqItem>
          ))}
        </div>
      </div>
    </Band>
  );
}

/* ── Related reading ──────────────────────────────────────────────────────────────────────── */

export function AudienceReading({ posts, audienceLabel }: { posts: PostCardData[]; audienceLabel: string }) {
  if (posts.length === 0) return null;
  // The label reads "For Fractional CMOs"; the heading already says "for".
  const audience = audienceLabel.replace(/^for\s+/i, '');
  return (
    <Band surface="gray" aria-labelledby="mk-aud-reading-title" className="mk-read-related">
      <div className="mk-rail">
        <div className="mk-aud-reading-head">
          <div>
            <h2 id="mk-aud-reading-title" className="mk-section mk-aud-h2">
              Latest Articles for {audience}
            </h2>
            <p className="mk-aud-lede">Stay updated with insights, best practices, and product updates tailored to your role.</p>
          </div>
          <ChevronLink href={BLOG_BASE_PATH} className="mk-aud-reading-all">
            View all articles
          </ChevronLink>
        </div>
        <ul className="mk-read-cards mk-read-cards--related">
          {posts.map((post) => (
            <PostCard key={post.id || post.slug} post={post} />
          ))}
        </ul>
      </div>
    </Band>
  );
}
