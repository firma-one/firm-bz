'use client';

/**
 * The Trust Center's systems map: an interactive diagram of who and what touches your data.
 * elkjs lays it out on the server (two layouts: left to right, and top to bottom for phones);
 * React Flow draws it here. Clicking a box opens its side panel; firmä is selected to start.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type { TrustMapDirection, TrustMapLayout, TrustMapNode, TrustMapNodeId } from './trust-map-data';
import './trust-map.css';

const TrustMapFlow = dynamic(() => import('./trust-map-flow').then((m) => m.TrustMapFlow), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="mk-trust-map-loading" />,
});

export function TrustMap({ nodes, layouts }: { nodes: TrustMapNode[]; layouts: Record<TrustMapDirection, TrustMapLayout> }) {
  const [phone, setPhone] = useState(false);
  const [touch, setTouch] = useState(false);
  const [selected, setSelected] = useState<TrustMapNodeId>('firma');
  const onSelect = useCallback((id: TrustMapNodeId) => setSelected(id), []);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const coarse = window.matchMedia('(hover: none)');
    const sync = () => {
      setPhone(narrow.matches);
      setTouch(coarse.matches);
    };
    sync();
    narrow.addEventListener('change', sync);
    coarse.addEventListener('change', sync);
    return () => {
      narrow.removeEventListener('change', sync);
      coarse.removeEventListener('change', sync);
    };
  }, []);

  const layout = phone ? layouts.DOWN : layouts.RIGHT;
  const node = nodes.find((n) => n.id === selected) ?? nodes[0];
  // Height follows the layout, so the canvas never jumps when React Flow arrives.
  const height = Math.round(layout.height + (phone ? 64 : 72));

  return (
    <div className="mk-trust-map">
      <div className="mk-trust-map-canvas" style={{ height }}>
        <p className="sr-only">
          A map of the systems that touch your data. Choose a system to read how it handles your data in the panel that follows.
        </p>
        <TrustMapFlow nodes={nodes} layout={layout} selected={selected} onSelect={onSelect} touch={touch} />
      </div>
      <aside id="mk-trust-map-panel" className="mk-trust-map-panel" aria-live="polite" aria-label={`${node.title}: details`}>
        <p className="mk-trust-map-panel-kind">{node.kind}</p>
        <h3 className="mk-trust-map-panel-title">{node.title}</h3>
        <p className="mk-trust-map-panel-detail">{node.detail}</p>
        <ul className="mk-trust-map-panel-points">
          {node.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mk-trust-map-panel-hint">Choose another box on the map to read about it.</p>
      </aside>
    </div>
  );
}
