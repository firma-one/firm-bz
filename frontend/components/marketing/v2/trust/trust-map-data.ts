/**
 * The Trust Center's systems map: who and what touches your data, and what flows between them.
 * Shared by the server layout (elkjs) and the client map (React Flow). Every line here restates a
 * claim the Trust Center already makes; keep them in step.
 */

export type TrustMapNodeId = 'team' | 'client' | 'firma' | 'storage' | 'metadata' | 'brio';

export type TrustMapNode = {
  id: TrustMapNodeId;
  /** Small green label above the title. */
  kind: string;
  title: string;
  subtitle: string;
  /** The dark, rimmed box (firmä itself). */
  primary?: boolean;
  /** The side panel. */
  detail: string;
  points: string[];
};

export type TrustMapEdge = { id: string; source: TrustMapNodeId; target: TrustMapNodeId; label: string };

export function trustMapNodes(brand: string): TrustMapNode[] {
  return [
    {
      id: 'team',
      kind: 'People',
      title: 'Your team',
      subtitle: 'Owners, contributors, reviewers',
      detail: `Your team signs in to ${brand} with a one-time email code or a Google account, through a dedicated sign-in service on OpenID Connect. There is no password to leak. Roles decide who can edit, who reviews and who only views.`,
      points: ['Email code or Google sign-in (OIDC)', 'Roles: Owner, Contributor, Reviewer', 'Every open and download is in the audit log'],
    },
    {
      id: 'client',
      kind: 'People',
      title: 'Your client',
      subtitle: 'A branded view',
      detail:
        'Clients open a view in your firm’s brand that shows only what you share. Internal docs tagged Never Share can never reach them, and when the engagement ends, everything you explicitly shared with that client is revoked.',
      points: ['Sees only what you share', 'Comments and approves in one place', 'Access revoked when the engagement ends'],
    },
    {
      id: 'firma',
      kind: 'The delivery layer',
      title: brand,
      subtitle: 'Engagements, Board, access, audit',
      primary: true,
      detail: `${brand} runs the delivery layer on its servers: engagements and the Board, status, comments and reminders, access and the audit log. It organizes your files without holding them, and every request travels over HTTPS.`,
      points: ['Non-custodial: files stay in your Drive', 'Encrypted in transit (HTTPS)', 'Leave anytime; your folders stay put'],
    },
    {
      id: 'storage',
      kind: 'Your storage',
      title: 'Google Drive or OneDrive',
      subtitle: 'Files stay where they are',
      detail: `${brand} reaches your Drive through OAuth 2.0 and keeps no copy of your files. Your folders, files and sharing settings stay yours, and you can revoke ${brand}’s access from your Google or Microsoft account at any time. SharePoint is in beta.`,
      points: ['Files and folders stay in your Drive', 'OAuth 2.0, revocable anytime', 'No file contents on our servers'],
    },
    {
      id: 'metadata',
      kind: 'What we store',
      title: 'Encrypted metadata',
      subtitle: 'Structure, never contents',
      detail:
        'What is stored is the structure of your work, not the work: engagements, statuses, permissions and the audit log. Sensitive fields (client and engagement names, contact details, comments and storage tokens) are encrypted with AES-256-GCM before they are stored.',
      points: ['Structure only, never file contents', 'Sensitive fields encrypted with AES-256-GCM', 'The audit log records every open and download'],
    },
    {
      id: 'brio',
      kind: 'Assistant',
      title: 'Brio',
      subtitle: 'Reads delivery data only',
      detail:
        'Brio, the assistant for client delivery, reads names, statuses, dates and who is involved, never what is inside a document or a comment. It never changes anything without your consent, and nothing reaches a client until a person on your team publishes it.',
      points: ['Never reads document contents', 'Never changes anything without your consent', 'Nothing reaches a client until you publish it'],
    },
  ];
}

export const TRUST_MAP_EDGES: TrustMapEdge[] = [
  { id: 'team-firma', source: 'team', target: 'firma', label: 'Email code or Google' },
  { id: 'client-firma', source: 'client', target: 'firma', label: 'Only what you share' },
  { id: 'firma-storage', source: 'firma', target: 'storage', label: 'OAuth 2.0 · no copy' },
  { id: 'firma-metadata', source: 'firma', target: 'metadata', label: 'AES-256-GCM' },
  { id: 'firma-brio', source: 'firma', target: 'brio', label: 'Never contents' },
];

export type TrustMapDirection = 'RIGHT' | 'DOWN';

/** Box sizes per direction: wide boxes left to right; compact ones when the map runs down a phone. */
export function trustMapNodeSize(node: Pick<TrustMapNode, 'primary'>, direction: TrustMapDirection) {
  if (direction === 'RIGHT') return node.primary ? { width: 220, height: 96 } : { width: 200, height: 84 };
  return node.primary ? { width: 220, height: 80 } : { width: 104, height: 92 };
}

export type TrustMapLayout = {
  direction: TrustMapDirection;
  width: number;
  height: number;
  positions: Record<TrustMapNodeId, { x: number; y: number }>;
};
