'use client';

/**
 * The hero's Ask Brio exchange, as a loop: idle 0.5 s, the question types itself, sends at 2.15 s, Brio
 * thinks until 3.05 s, the answer streams word by word, the chips arrive at 6.8 s, then it holds until
 * 11.4 s and starts over. Paused while off-screen; the finished exchange under reduced motion.
 */
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../motion';
import { useDemoDates } from '../demo-dates-context';

export const ASK_QUESTION = 'What needs my attention today?';
const LOOP_MS = 11400;
const FINAL_T = 10000;

export type AnswerToken = { w: string; bold: boolean };

/** "One thing. **Creative & Landing Page Assets** was due …" → words, with ** marking bold runs. */
export function toTokens(str: string): AnswerToken[] {
  const out: AnswerToken[] = [];
  let bold = false;
  for (let w of str.split(' ')) {
    if (w.startsWith('**')) {
      bold = true;
      w = w.slice(2);
    }
    const end = w.length > 2 && w.endsWith('**');
    if (end) w = w.slice(0, -2);
    out.push({ w: `${w} `, bold });
    if (end) bold = false;
  }
  return out;
}

export function useAskBrioLoop(onScreen: boolean, { secondParagraph = true } = {}) {
  const reduce = usePrefersReducedMotion();
  const live = onScreen && !reduce;
  const [t, setT] = useState(reduce ? FINAL_T : 0);
  const D = useDemoDates();

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setT((v) => (v + 100) % LOOP_MS), 100);
    return () => window.clearInterval(id);
  }, [live]);

  const time = reduce ? FINAL_T : t;
  const a1 = toTokens(
    `One thing. **Creative & Landing Page Assets** was due ${D.d02Rel} and is still waiting on Horizon FinTech’s approval.`,
  );
  const a2 = secondParagraph
    ? toTokens(
        `The engagement is 84% through its timeline with 1 of 4 deliverables approved, so it’s behind pace. Next to finish: PR & Media Outreach Pack, due ${D.d03Rel}.`,
      )
    : [];
  const typedN = Math.max(0, Math.min(ASK_QUESTION.length, Math.floor((time - 500) / 45)));
  const sent = time >= 2150;
  const typing = !sent && time >= 500;
  const shown = time >= 3050 ? Math.floor((time - 3050) / 70) + 1 : 0;
  const v1 = a1.slice(0, Math.min(a1.length, shown));
  const v2 = a2.slice(0, Math.max(0, shown - a1.length));
  const chipOn = (i: number) => time >= 6800 + i * 150;

  return {
    typing,
    typed: ASK_QUESTION.slice(0, typedN),
    hasTyped: typing && typedN > 0,
    bubble: time >= 500,
    sent,
    thinking: sent && time < 3050,
    a1: v1,
    a2: v2,
    caret1: v1.length > 0 && v2.length === 0,
    caret2: v2.length > 0,
    chips: [chipOn(0), chipOn(1), chipOn(2)] as const,
  };
}
