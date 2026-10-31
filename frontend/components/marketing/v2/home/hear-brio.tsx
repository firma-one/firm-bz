'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { SpokenWord } from '@/lib/demo/tour-read-along';
import { useStreamingReveal } from '@/lib/demo/use-streaming-reveal';
import { HEAR_BRIO_CLIP, HEAR_BRIO_LINE } from './hear-brio-line';

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

/** When each word is spoken, and how loud the voice is 20 times a second (scripts/tour-narration/generate.py). */
interface Timings {
  words: SpokenWord[];
  levels: number[];
}

/** Each bar's share of the voice's loudness: tallest in the middle, like a voice's wave. */
const BARS = [0.55, 0.85, 1, 0.75, 0.5];
const LEVELS_PER_SECOND = 20;
/** How tall a bar stands at rest, as a share of its full height. */
const REST = 0.25;

/**
 * "Hear Brio" in Meet Brio: Brio introduces itself in its own voice, the voice that narrates the
 * product tour (.claude/plans/tour-chapters.md, Brio's voice). Nothing plays until the visitor
 * asks. While Brio speaks, a wave beside the button rises and falls with the voice (its loudness,
 * saved with the clip, so it goes quiet in the pauses), and the line opens below, each word coming
 * up as it's said. Pause holds both; at the end it offers to play again. Visitors who'd rather not
 * see motion get a still wave.
 */
export function HearBrio() {
  const [state, setState] = useState<State>('idle');
  const [timings, setTimings] = useState<Timings | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const fetching = useRef(false);

  // The word times and levels (about 4 KB), fetched when the visitor reaches for the button.
  const prefetch = useCallback(() => {
    if (fetching.current) return;
    fetching.current = true;
    fetch(HEAR_BRIO_CLIP.timings)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Timings | null) => {
        if (data) setTimings({ words: data.words, levels: data.levels });
      })
      .catch(() => {
        fetching.current = false;
      });
  }, []);

  const toggle = () => {
    prefetch();
    let audio = audioRef.current;
    if (!audio) {
      const clip = new Audio(HEAR_BRIO_CLIP.src);
      clip.addEventListener('playing', () => setState('playing'));
      // A pause also fires as the clip ends, just before `ended`.
      clip.addEventListener('pause', () => {
        if (!clip.ended) setState('paused');
      });
      clip.addEventListener('ended', () => setState('ended'));
      audioRef.current = clip;
      audio = clip;
    }
    if (state === 'loading' || state === 'playing') {
      audio.pause();
      return;
    }
    if (state === 'ended') audio.currentTime = 0;
    setState('loading');
    // Started from a click, so the browser lets it play; if it still won't, the button comes back.
    audio.play().catch(() => setState((now) => (now === 'loading' ? (audio.currentTime > 0 ? 'paused' : 'idle') : now)));
  };

  // Not left talking after the page moves on.
  useEffect(() => () => audioRef.current?.pause(), []);

  // The wave, following the voice while it plays; at rest otherwise, and for reduced motion.
  useEffect(() => {
    const bars = barsRef.current ? Array.from(barsRef.current.children) as HTMLElement[] : [];
    const rest = () => bars.forEach((bar) => (bar.style.transform = `scaleY(${REST})`));
    if (state !== 'playing' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (state !== 'paused') rest();
      return;
    }
    const tick = () => {
      const at = audioRef.current?.currentTime ?? 0;
      const i = Math.floor(at * LEVELS_PER_SECOND);
      bars.forEach((bar, k) => {
        // Each bar a beat behind the one before, so the wave travels; a little sway keeps it alive
        // when the voice holds steady (or before the levels have arrived).
        const level = timings?.levels[Math.max(0, i - k)] ?? 0.6;
        const sway = 0.85 + 0.15 * Math.sin(at * 11 + k * 1.7);
        bar.style.transform = `scaleY(${Math.max(REST * 0.6, Math.min(1, level * BARS[k] * sway))})`;
      });
    };
    const timer = setInterval(tick, 50);
    tick();
    return () => clearInterval(timer);
  }, [state, timings]);

  // The line streaming in as Brio says it; whole once it's over.
  useStreamingReveal({
    container: captionRef,
    highlight: 'brio-unspoken',
    on: state === 'loading' || state === 'playing' || state === 'paused',
    words: timings?.words ?? null,
    heard: () => audioRef.current?.currentTime ?? 0,
  });

  const open = state !== 'idle';
  const label = state === 'playing' || state === 'loading' ? 'Pause' : state === 'paused' ? 'Resume' : state === 'ended' ? 'Hear again' : 'Hear Brio';
  const Icon = state === 'playing' || state === 'loading' ? Pause : state === 'ended' ? RotateCcw : Play;

  return (
    <div className="mk-hear-brio">
      <button
        type="button"
        onClick={toggle}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        className="mk-btn mk-btn--ghost-dark mk-btn--sm mk-hear-brio-btn"
        aria-label={state === 'idle' ? 'Hear Brio introduce itself' : label}
      >
        <Icon size={15} strokeWidth={2.4} aria-hidden style={{ color: 'var(--mk-electric)' }} />
        <span>{label}</span>
        <span ref={barsRef} className="mk-hear-brio-wave" aria-hidden>
          {BARS.map((_, k) => (
            <span key={k} />
          ))}
        </span>
      </button>
      <div className={`mk-hear-brio-caption${open ? ' is-open' : ''}`} inert={!open}>
        <div>
          <p ref={captionRef}>{HEAR_BRIO_LINE}</p>
        </div>
      </div>
    </div>
  );
}
