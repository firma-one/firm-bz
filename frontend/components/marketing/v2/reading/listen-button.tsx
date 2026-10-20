'use client';

/**
 * The article's read-aloud control: the existing TextToSpeech player, themed for the green system
 * (reading.css), with a word beside it that says what it is doing. The word is a click target for
 * the mouse only; keyboard and screen-reader users get the player's own labeled buttons.
 */
import { useCallback, useRef, useState } from 'react';
import { TextToSpeech } from '@/components/blog/text-to-speech';

type ListenState = 'idle' | 'playing' | 'paused';

const LABEL: Record<ListenState, string> = { idle: 'Listen', playing: 'Playing', paused: 'Paused' };

export function ListenButton({ text }: { text: string }) {
  const [state, setState] = useState<ListenState>('idle');
  const ref = useRef<HTMLSpanElement>(null);
  // Stable: the player re-reports its state whenever this callback's identity changes.
  const onState = useCallback((playing: boolean, paused: boolean) => {
    setState(playing ? 'playing' : paused ? 'paused' : 'idle');
  }, []);

  return (
    <span ref={ref} className="mk-read-listen" data-state={state}>
      <TextToSpeech text={text} size="md" tone="kinetic" title="Listen to this article" onPlayingStateChange={onState} />
      <span aria-hidden="true" className="mk-read-listen-label" onClick={() => ref.current?.querySelector('button')?.click()}>
        {LABEL[state]}
      </span>
    </span>
  );
}
