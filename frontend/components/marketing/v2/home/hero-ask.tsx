'use client';

/**
 * Ask Brio in the hero: the desktop panel docked beside the Engagement Overview, and the phone card
 * under the health card. Both type the question, think, stream the answer and settle on chips.
 */
import { ArrowUp } from 'lucide-react';
import { Brio } from '@/components/ui/brio';
import { useOnScreen } from '../motion';
import { ASK_QUESTION, useAskBrioLoop, type AnswerToken } from './ask-brio-loop';

const UI_FONT = 'var(--mk-font-body)';

function Tokens({ list }: { list: AnswerToken[] }) {
  return (
    <>
      {list.map((tk, i) => (
        <span key={i} style={{ fontWeight: tk.bold ? 600 : 400 }}>
          {tk.w}
        </span>
      ))}
    </>
  );
}

function ChipFade({ on, children, style }: { on: boolean; children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <span
      style={{
        padding: '4px 9px',
        borderRadius: 999,
        fontSize: 12,
        opacity: on ? 1 : 0,
        transform: on ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 300ms ease, transform 300ms ease',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const BrioGreen = () => (
  <span style={{ color: '#009669' }}>
    <Brio fixedColor iconClassName="mk-sparkle" />
  </span>
);

/** Desktop: the panel docked on the right of the Overview (372 px, design pixels). */
export function AskBrioPanel() {
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const s = useAskBrioLoop(onScreen);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        right: -40,
        top: 64,
        width: 372,
        background: '#FFFFFF',
        borderRadius: 16,
        boxShadow: '0 0 0 1px rgba(0,150,105,0.25), 0 0 0 7px rgba(125,255,119,0.18), 0 44px 88px -24px rgba(3,40,27,0.45)',
        fontFamily: UI_FONT,
        fontSize: 13,
        color: '#37352F',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(55,53,47,0.08)' }}>
        <span style={{ fontWeight: 600 }}>
          Ask <BrioGreen />
        </span>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, background: '#F1F1EF', color: '#55534E', fontSize: 11.5 }}>
          This engagement
        </span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 300, boxSizing: 'border-box' }}>
        {s.sent && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ maxWidth: 250, padding: '8px 12px', borderRadius: '12px 12px 4px 12px', background: '#F1F1EF' }}>{ASK_QUESTION}</span>
          </div>
        )}
        {s.sent && (
          <div style={{ minWidth: 0, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 4, fontSize: 13 }}>
              <BrioGreen />
            </div>
            {s.thinking && (
              <div aria-label="Brio is thinking" className="mk-think">
                <span />
                <span />
                <span />
              </div>
            )}
            <div>
              <Tokens list={s.a1} />
              {s.caret1 && <span className="mk-caret" />}
            </div>
            {s.a2.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Tokens list={s.a2} />
                {s.caret2 && <span className="mk-caret" />}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <ChipFade on={s.chips[0]} style={{ border: '1px solid rgba(194,65,59,0.25)', background: '#FCEDEC', color: '#A2342F' }}>
                1 overdue
              </ChipFade>
              <ChipFade on={s.chips[1]} style={{ border: '1px solid rgba(168,106,6,0.25)', background: '#FBF3E2', color: '#8A5A00' }}>
                1 waiting on the client
              </ChipFade>
              <ChipFade on={s.chips[2]} style={{ border: '1px solid rgba(55,53,47,0.14)', color: '#55534E' }}>
                Open QPL-11 →
              </ChipFade>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          margin: '0 12px 12px',
          border: '1px solid rgba(0,150,105,0.4)',
          borderRadius: 10,
          padding: '8px 8px 8px 12px',
          color: s.hasTyped ? '#37352F' : '#A5A4A1',
          display: 'flex',
          alignItems: 'center',
          minHeight: 40,
          boxSizing: 'border-box',
        }}
      >
        <span>{s.hasTyped ? s.typed : 'Ask Brio about this engagement…'}</span>
        {s.typing && <span className="mk-caret" />}
        <span
          style={{
            marginLeft: 'auto',
            width: 22,
            height: 22,
            flex: 'none',
            borderRadius: 6,
            background: s.hasTyped ? '#047857' : '#E3E2DE',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 200ms ease',
          }}
        >
          <ArrowUp size={12} strokeWidth={2.6} color="#FFFFFF" aria-hidden />
        </span>
      </div>
      <div style={{ padding: '0 16px 12px', color: '#8D8B86', fontSize: 11 }}>
        <Brio noIcon /> reports what the data shows. Decisions stay with you.
      </div>
    </div>
  );
}

/** Phone: the answer card under the health card; the question types into its bubble. */
export function AskBrioCard() {
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const s = useAskBrioLoop(onScreen, { secondParagraph: false });
  return (
    <div
      ref={ref}
      style={{
        margin: '-10px -6px 0 18px',
        position: 'relative',
        background: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        boxShadow: '0 0 0 1px rgba(0,150,105,0.25), 0 0 0 6px rgba(125,255,119,0.18), 0 26px 50px -18px rgba(3,40,27,0.45)',
        fontFamily: UI_FONT,
        fontSize: 13,
        color: '#37352F',
        minHeight: 196,
        boxSizing: 'border-box',
      }}
    >
      {s.bubble && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ padding: '7px 11px', borderRadius: '12px 12px 4px 12px', background: '#F1F1EF' }}>
            {s.sent ? ASK_QUESTION : s.typed}
            {s.typing && <span className="mk-caret" />}
          </span>
        </div>
      )}
      {s.sent && (
        <>
          <div style={{ marginTop: 10, lineHeight: 1.55 }}>
            <span style={{ display: 'block', marginBottom: 3 }}>
              <BrioGreen />
            </span>
            {s.thinking && (
              <div aria-label="Brio is thinking" className="mk-think">
                <span />
                <span />
                <span />
              </div>
            )}
            <Tokens list={s.a1} />
            {s.caret1 && <span className="mk-caret" />}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ChipFade on={s.chips[0]} style={{ padding: '3px 8px', background: '#FCEDEC', color: '#A2342F', fontSize: 11.5 }}>
              1 overdue
            </ChipFade>
            <ChipFade on={s.chips[1]} style={{ padding: '3px 8px', background: '#FBF3E2', color: '#8A5A00', fontSize: 11.5 }}>
              1 waiting on the client
            </ChipFade>
          </div>
        </>
      )}
    </div>
  );
}
