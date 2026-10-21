/**
 * Audience-specific landing page content for CMOs and agencies.
 * Each config defines hero, problems, FAQs, and impact messaging.
 */

import { DollarSign, AlertTriangle, Shield, CheckCircle } from "lucide-react"
import type { ReactNode } from "react"

export interface AudienceContent {
  audienceId: string
  audienceLabel: string
  audienceSubtitle: string
  heroHeadline: string
  /** The trailing phrase of `heroHeadline` that the v2 hero sets in bottle green. */
  heroAccent?: string
  heroSubheading: string
  ctaText: string
  problemTitle: string
  problems: string[]
  problemBoxTitle: string
  problemBoxItems: string[]
  businessImpactTitle: string
  businessImpacts: Array<{
    icon: "dollar" | "alert" | "shield" | "checkmark"
    title: string
    description: string
  }>
  perceptionShiftTitle: string
  perceptionShiftWithout: string[]
  perceptionShiftWith: string[]
  perceptionShiftCta: string
  faqs: Array<{
    q: string
    a: string
  }>
}

// Fractional CMO - Client-facing delivery model
export const fractionalCMOContent: AudienceContent = {
  audienceId: "fractional-cmo",
  audienceLabel: "For Fractional CMOs",
  audienceSubtitle: "Fractional CMO",
  heroHeadline: "If your work is not visible, it is undervalued",
  heroAccent: "it is undervalued",
  heroSubheading:
    "Stop sending Drive links and PDFs. Show clients the value of your work with a professional portal. Transform how they perceive your strategy. Justify retainers. Land more clients.",
  ctaText: "See How Top CMOs Present Their Work",
  problemTitle: "The Problem: Great Work, Invisible Value",
  problems: [
    "Clients get a PDF email. They skim it. They don't remember it.",
    "Strategy docs disappear in Drive folders. Clients forget what they paid for.",
    "No narrative. No structure. Just files. You look like a contractor, not a strategic partner.",
    "Retainer justification is hard. 'What did I get for my money?' they ask.",
  ],
  problemBoxTitle: "What Most CMOs Do:",
  problemBoxItems: [
    'Email: "Here\'s your monthly report..."',
    "Drive link (clients lose it)",
    "Hopes they read it",
    "Gets pushback on price",
  ],
  businessImpactTitle: "The Business Impact",
  businessImpacts: [
    {
      icon: "dollar",
      title: "Higher Retainer Renewal Rates",
      description:
        "Clients who see organized, professional delivery renew more often. You lose fewer clients to perceived low value, and every retainer you keep is one you don't have to replace.",
    },
    {
      icon: "alert",
      title: "Protection from Brand Damage",
      description:
        "Stop sending messy Drive links and email attachments that scream 'amateur.' A professional portal fixes the perception problem instantly. Protects the premium brand you've built.",
    },
    {
      icon: "checkmark",
      title: "20-40 Hours Freed Per Month",
      description:
        "Eliminate email threads, version confusion, repetitive explanation calls. The more clients you lead, the more hours you get back each month.",
    },
  ],
  perceptionShiftTitle: "The Perception Shift",
  perceptionShiftWithout: [
    'Email: "Here\'s your strategy..."',
    "Drive link (they lose it immediately)",
    "Scattered attachments across email",
    "No narrative, just files",
    "Looks disorganized, amateur",
  ],
  perceptionShiftWith: [
    "Your branded portal with your logo",
    "Organized, professional workspace",
    "One destination for all engagement work",
    "Clear narrative and structure",
    "Looks premium, intentional, professional",
  ],
  perceptionShiftCta:
    "Same work. Completely different perception. That perception difference is what changes retainer renewals and lets you raise rates.",
  faqs: [
    {
      q: "How does Firma help fractional CMOs stand out?",
      a: "Most fractional CMOs deliver via email or Drive links. Clients see scattered, disorganized handoffs. Firma gives you a branded, professional portal where clients experience your work as premium and intentional. The same strategy, better perceived.",
    },
    {
      q: "What exactly do clients see?",
      a: "A clean, branded workspace with your firm's logo and colors. Your Drive folders appear organized and professional. Clients access strategy docs, deliverables, and engagement materials from a single, branded destination instead of hunting email attachments. It feels premium.",
    },
    {
      q: "How does this help me raise rates or win more retainers?",
      a: "Clients perceive premium delivery when work is organized and presented professionally. A branded portal makes you look like a high-end agency, not a freelancer. Clients who can see your work are more likely to renew retainers and less likely to push back on price.",
    },
    {
      q: "Do clients need a login?",
      a: "Yes, but onboarding is frictionless. You send them an invite email link. They click it, use an OTP based signup & subsequent signin. Takes less than 1 minute.",
    },
    {
      q: "Is it really white-labeled?",
      a: "Completely. Your brand, your colors, your domain. Clients see your firm name and logo. Firma stays in the background. Feels like a proprietary tool built just for them.",
    },
    {
      q: "What about my files—are they secure?",
      a: "Your files stay in YOUR Google Drive. We don't store or copy them. You control access: decide who sees what and revoke instantly. You get an audit trail showing every time a client opens something. Full control, full transparency.",
    },
    {
      q: "Can I lock down sensitive frameworks?",
      a: "Yes. Tag internal docs and frameworks as Never Share, so they can never be shared with a client by accident. And when an engagement ends, everything you explicitly shared with that client is revoked.",
    },
    {
      q: "How much time does this save per month?",
      a: "You eliminate: email status update threads, 'where's my report?' messages, PDF versioning confusion, and redundant explanation calls. That's hours back every month for each client, and it adds up quickly when you lead several.",
    },
    {
      q: "What's the real business impact?",
      a: "Simple math: if this helps you win one extra retainer client a year, or keep one you would otherwise lose, it pays for itself. Plus, clients perceive your work as worth more, so you can raise rates.",
    },
    {
      q: "How is this different from just using Drive or email?",
      a: "Drive links look amateur. Email attachments scatter. Firma creates a unified, branded experience that says 'I'm a premium consultant, not a freelancer.' Same work, completely different perception. That's the entire point.",
    },
  ],
}

// Fulltime CMO - Internal alignment model
export const fulltimeCMOContent: AudienceContent = {
  audienceId: "fulltime-cmo",
  audienceLabel: "For Fulltime CMOs",
  audienceSubtitle: "Fulltime CMO",
  heroHeadline: "Unite your team around one shared vision",
  heroAccent: "one shared vision",
  heroSubheading:
    "Stop operating in silos. Give your entire team—product, sales, leadership—one unified workspace for strategy, execution, and alignment. Your strategy becomes visible. Your impact becomes undeniable.",
  ctaText: "See How Leadership Teams Align",
  problemTitle: "The Problem: Strategy in Silos",
  problems: [
    "Marketing, product, and sales work in different tools. No shared truth about strategy.",
    "Leadership asks 'where's the strategy?' and your docs are scattered across drives and emails.",
    "Team meetings lose time to status updates instead of moving strategy forward.",
    "Executives don't see your work, so they can't advocate for marketing or approve budgets.",
  ],
  problemBoxTitle: "What Most Teams Do:",
  problemBoxItems: [
    "Slack: 'Can someone find the strategy doc?'",
    "Email chains with outdated attachments",
    "Drive folders no one can navigate",
    "Monthly meetings that repeat the same updates",
  ],
  businessImpactTitle: "The Business Impact",
  businessImpacts: [
    {
      icon: "checkmark",
      title: "Executive Confidence in Marketing Strategy",
      description:
        "Leadership sees your strategy execution in real time. No more 'marketing is a black box.' Executives understand the plan, can advocate for it, and approve budgets faster.",
    },
    {
      icon: "checkmark",
      title: "Faster Cross-Functional Alignment",
      description:
        "Product and sales see marketing strategy without waiting for meetings. Decisions move from months to weeks because everyone's looking at the same document.",
    },
    {
      icon: "checkmark",
      title: "Retention of Top Marketing Talent",
      description:
        "Your team sees the full picture of their work and impact. They're not frustrated by silos. They feel like they're part of something bigger. Fewer top performers leave.",
    },
    {
      icon: "checkmark",
      title: "Reclaim 20-30 Hours/Month from Status Updates",
      description:
        "Stop repeating the same information in different meetings. Everyone checks the shared workspace. Your team gets back to strategic work instead of explaining.",
    },
  ],
  perceptionShiftTitle: "The Alignment Shift",
  perceptionShiftWithout: [
    "Marketing strategy in a Drive folder nobody visits",
    "Team asks 'what's the plan?' in Slack 3 times",
    "Leadership uninformed, strategy unstoppable",
    "Meetings repeat the same updates",
    "Your work feels invisible inside your org",
  ],
  perceptionShiftWith: [
    "Your strategy is the source of truth for everyone",
    "Teams see progress in real time",
    "Leadership understands the vision and impact",
    "Meetings focus on strategy, not status",
    "Marketing becomes visible and valued internally",
  ],
  perceptionShiftCta:
    "When your team sees your work, they believe in it. When leadership sees your work, they fund it.",
  faqs: [
    {
      q: "Will this actually change how leadership perceives marketing?",
      a: "Yes. Executives rarely see marketing strategy in detail because it's scattered. When it's organized and visible, they understand the work, approve budgets faster, and advocate for you in board meetings. Visibility changes perception.",
    },
    {
      q: "How do we get buy-in from other departments?",
      a: "When product and sales see marketing strategy in one place—instead of hunting emails—they engage differently. They see how their work connects to the broader plan. That shared context builds alignment.",
    },
    {
      q: "Can I control who sees what?",
      a: "Completely. You can set role-based access. Product sees product marketing. Sales sees go-to-market. Finance sees budget. Leadership sees the whole strategy. Everyone gets the right context without information overload.",
    },
    {
      q: "Won't my team just ignore another tool?",
      a: "No, because this is where the strategy lives—not where you announce it. It's the source of truth. If your team needs to understand the plan, they visit here. Over time, it becomes the natural place to look.",
    },
    {
      q: "Is this just a document storage tool?",
      a: "No. It's a shared workspace where strategy, execution, and results live together. Your Drive folders stay in Drive. We create the organized, accessible layer on top so your team actually uses what you've created.",
    },
    {
      q: "How much visibility will we have into team alignment?",
      a: "You see who accessed the strategy, when, and for how long. You see which sections get the most attention. This tells you what resonates and where alignment is weak so you can follow up.",
    },
    {
      q: "Can we measure the impact?",
      a: "You can see execution progress in real time. When strategy is visible and aligned, decisions move faster, projects ship faster, and teams coordinate better. The impact is measurable in velocity.",
    },
    {
      q: "What about onboarding new team members?",
      a: "Instead of 'here's a Drive folder,' new hires get one place to understand the strategy, the vision, and where they fit. Onboarding is faster because the context is organized and clear.",
    },
    {
      q: "Can we share this with the board?",
      a: "Yes. You can give board members view access to strategy updates without needing separate board decks. One source of truth. Reduces the gap between what leadership sees and what's actually happening.",
    },
    {
      q: "How is this different from Confluence or Notion?",
      a: "Those are general wikis. This is purpose-built for strategic work and strategy execution. It connects your Drive folders, permissions, audit trails—everything your org uses. It's not another disconnected tool.",
    },
  ],
}

// Marketing Agencies - Client delivery model
export const agencyContent: AudienceContent = {
  audienceId: "marketing-agencies",
  audienceLabel: "For Marketing Agencies",
  audienceSubtitle: "Marketing Agencies",
  heroHeadline: "Your client work deserves a premium home",
  heroAccent: "a premium home",
  heroSubheading:
    "Stop competing on price. Give clients a branded, professional workspace where they see the value of your work. They'll renew because they perceive you as premium. Reduce churn. Raise rates. Stand out.",
  ctaText: "See How Top Agencies Deliver",
  problemTitle: "The Problem: Client Churn from Perception",
  problems: [
    "Clients don't see or appreciate the work. Email reports disappear. Drive links get lost.",
    "Even great campaigns look amateur when delivered via PDF. Clients shop on price instead of value.",
    "You spend 5+ hours per week answering 'where's my report?' and version confusion.",
    "Clients churn because they don't perceive the value. You build premium work, but deliver like a freelancer.",
  ],
  problemBoxTitle: "What Most Agencies Do:",
  problemBoxItems: [
    'Email: "Here\'s your campaign report..."',
    "PDF attachment (client loses it in inbox)",
    "Client asks 'where's my report?' next week",
    "Client compares you on price, not quality",
  ],
  businessImpactTitle: "The Business Impact",
  businessImpacts: [
    {
      icon: "checkmark",
      title: "Competitive Differentiation",
      description:
        "You look premium. Your competitors look like freelancers. Clients see the difference immediately. You win on value, not price.",
    },
    {
      icon: "checkmark",
      title: "Reduce Client Churn",
      description:
        "When clients see organized, professional delivery, they renew. One less client to replace is worth thousands. Recovery rate jumps when you show value instead of hoping they remember it.",
    },
    {
      icon: "checkmark",
      title: "Pricing Power: Raise Rates",
      description:
        "Premium perception justifies premium pricing. Clients who see professional delivery are less likely to push back on rates and more willing to expand scope.",
    },
    {
      icon: "checkmark",
      title: "15-25 Hours/Month Freed",
      description:
        "Eliminate status update calls, 'where's my report?' messages, and version confusion. Your team reclaims time to do better creative work instead of administrative updates.",
    },
  ],
  perceptionShiftTitle: "The Delivery Shift",
  perceptionShiftWithout: [
    'Email: "Here\'s your campaign performance..."',
    "PDF attachment (clients lose it)",
    "Scattered deliverables across emails",
    "No narrative or structure",
    "Looks like contractor work, not premium agency",
  ],
  perceptionShiftWith: [
    "Your branded portal with your agency logo",
    "Organized, professional workspace",
    "All deliverables in one place",
    "Clear story about what you did and why",
    "Looks premium, intentional, high-end",
  ],
  perceptionShiftCta:
    "Same campaign. Completely different perception. Premium delivery is what converts one-time projects into retainers and one-year contracts into three-year relationships.",
  faqs: [
    {
      q: "How much time does this save per month?",
      a: "You eliminate email threads, 'where's my report?' calls, PDF versioning, and 'can you send me X again?' messages. That's hours back every month for each client, across every client you manage.",
    },
    {
      q: "Can I really white-label this?",
      a: "Completely. Clients see your brand, your logo, your domain. They experience it as your proprietary platform, not someone else's tool. Firma stays invisible. It feels like you built it just for them.",
    },
    {
      q: "Will clients actually use it, or will I need to train them?",
      a: "Onboarding takes less than 1 minute. You send an invite link, they click it, set a password with OTP, and they're in. No training needed. The interface is intuitive—if they can use email, they can use this.",
    },
    {
      q: "How does this help me win new clients?",
      a: "Show prospects your delivery platform in the proposal. They see you deliver like an agency, not a freelancer. Premium delivery experience is a competitive advantage. Closes deals that price alone can't win.",
    },
    {
      q: "Can I organize multiple client projects in one place?",
      a: "Yes. Each client gets their own branded workspace with their project files. You can manage all clients from one dashboard. Scale delivery without chaos.",
    },
    {
      q: "What if a client doesn't like another project in their folder?",
      a: "You control exactly what each client sees. If you're managing multiple brands for one holding company, each brand sees only their work. Permissions are granular and easy to set.",
    },
    {
      q: "How do I handle client approvals and feedback?",
      a: "Clients can comment directly on deliverables. You track feedback in one place. No more email threads or lost feedback in Drive comments. Everything is organized by project.",
    },
    {
      q: "Can I show ROI and performance metrics?",
      a: "Yes. Pull analytics from your campaigns, embed them in the portal, and clients see impact in real time. They stop asking 'are we getting results?' when they see the dashboard.",
    },
    {
      q: "Is my client work secure if it's shared with clients?",
      a: "Your files stay in your Google Drive. Clients only see what you decide to share. You control access and revoke instantly. You get an audit trail of every access. Full control, zero compromise.",
    },
  ],
}

// Fractional executives (every fractional leadership role) - client-facing delivery model.
// The page body was a hand-written copy of the fractional CMO page, so it shares that copy; the hero,
// the FAQ (the questions the page's FAQPage JSON-LD has always carried) and the demo link are its own.
export const fractionalExecsContent: AudienceContent = {
  ...fractionalCMOContent,
  audienceId: "fractional-execs",
  audienceLabel: "For Fractional Executives",
  audienceSubtitle: "Fractional Executives",
  heroHeadline: "Fractional CFO, COO, CMO or CISO? Make your work visible.",
  heroAccent: "Make your work visible.",
  heroSubheading:
    "If your work is not visible, it is undervalued. Stop sending Drive links and PDFs: give every client you lead one professional portal for your strategy, reports and deliverables. Justify retainers. Land more clients.",
  ctaText: "Book a Demo",
  faqs: [
    {
      q: "How does Firma help fractional CMOs present work to clients?",
      a: "Firma provides a professional, branded client portal where fractional CMOs can present their work with context and narrative. Instead of sending raw Drive links or PDF emails, clients see a structured, polished presentation of your strategy, reports, and performance data—making your work more visible and valuable.",
    },
    {
      q: "What's included in the monthly marketing report portal?",
      a: "The monthly marketing report portal is a live, interactive workspace where clients can view their campaign performance, strategic insights, and actionable recommendations. It replaces static PDFs with a dynamic experience that keeps clients engaged and aware of the value you're delivering.",
    },
    {
      q: "Do clients need to create a login?",
      a: "Yes, but onboarding takes less than 1 minute. You send them an invite email link. They click it, set up their login instantly (no password reset emails or complexity), and they're in. Frictionless first-time access.",
    },
    {
      q: "How do I track which clients have viewed my reports?",
      a: "Firma provides an audit trail showing when clients access documents, which pages they view, and how long they spend in the portal. This gives you visibility into client engagement and helps you understand which recommendations are being reviewed.",
    },
    {
      q: "Is it safe to share confidential strategy docs through Firma?",
      a: "Absolutely. Firma uses non-custodial architecture, meaning your files stay in your Google Drive and you maintain full control. You can tag sensitive frameworks as 'Never Share' and revoke access instantly. All data is encrypted in transit and at rest.",
    },
    {
      q: "Can I customize the portal with my branding?",
      a: "Yes. Firma is fully white-labeled, so clients see your brand, logo, and custom domain. The Firma product stays in the background, making it feel like a proprietary tool built just for your firm.",
    },
    {
      q: "How long does it take to set up a client portal?",
      a: "Setup takes minutes. Connect your Google Drive, select the folders you want to share, map them to client projects, and you're done. No technical skills required—the interface is intuitive and self-guided.",
    },
    {
      q: "Do I need technical skills to use Firma?",
      a: "No. Firma is designed for non-technical users. The setup is guided, the interface is intuitive, and support is available if you need it. You don't need to manage servers, code, or infrastructure.",
    },
    {
      q: "How does Firma compare to sending reports via email or Drive links?",
      a: "Email and Drive links feel transactional and impersonal—clients often miss updates or lose context. Firma creates a dedicated, branded workspace that feels premium and intentional. Clients see your work is organized, professional, and valued. Plus, you get visibility into engagement and can update content in real-time without sending new emails.",
    },
  ],
}

export const audienceContentMap = {
  [fractionalCMOContent.audienceId]: fractionalCMOContent,
  [fulltimeCMOContent.audienceId]: fulltimeCMOContent,
  [agencyContent.audienceId]: agencyContent,
}
