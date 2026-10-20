'use client';

/**
 * The Trust Center map's canvas, drawn with React Flow at the positions elkjs computed on the server.
 * Loaded on demand (next/dynamic), so React Flow stays out of the page's first bundle.
 *
 * It never traps the page: scroll and double-click don't zoom, and on touch screens dragging scrolls
 * the page instead of panning. The + / − / fit buttons zoom; clicking a box opens its side panel.
 */
import { useMemo } from 'react';
import { Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TRUST_MAP_EDGES, trustMapNodeSize, type TrustMapLayout, type TrustMapNode, type TrustMapNodeId } from './trust-map-data';

type SystemData = {
  node: TrustMapNode;
  selected: boolean;
  vertical: boolean;
  onSelect: (id: TrustMapNodeId) => void;
};

function SystemNode({ data }: NodeProps<Node<SystemData>>) {
  const { node, selected, vertical, onSelect } = data;
  return (
    <>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} isConnectable={false} className="mk-trust-map-handle" />
      <button
        type="button"
        aria-pressed={selected}
        aria-controls="mk-trust-map-panel"
        onClick={() => onSelect(node.id)}
        className={`mk-trust-map-node${node.primary ? ' mk-trust-map-node--primary' : ''}${selected ? ' is-selected' : ''}`}
      >
        <span className="mk-trust-map-kind">{node.kind}</span>
        <span className="mk-trust-map-title">{node.title}</span>
        <span className="mk-trust-map-sub">{node.subtitle}</span>
      </button>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} isConnectable={false} className="mk-trust-map-handle" />
    </>
  );
}

const nodeTypes = { system: SystemNode };

export function TrustMapFlow({
  nodes,
  layout,
  selected,
  onSelect,
  touch,
}: {
  nodes: TrustMapNode[];
  layout: TrustMapLayout;
  selected: TrustMapNodeId;
  onSelect: (id: TrustMapNodeId) => void;
  /** Touch screens: no drag-to-pan, so a swipe over the map still scrolls the page. */
  touch: boolean;
}) {
  const vertical = layout.direction === 'DOWN';

  const rfNodes = useMemo<Node<SystemData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'system',
        position: layout.positions[n.id],
        data: { node: n, selected: n.id === selected, vertical, onSelect },
        style: trustMapNodeSize(n, layout.direction),
        draggable: false,
        selectable: false,
        // The box's own button takes focus; the node wrapper doesn't need to.
        focusable: false,
      })),
    [nodes, layout, selected, vertical, onSelect],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      TRUST_MAP_EDGES.map((e) => {
        const on = e.source === selected || e.target === selected;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'default',
          // Top to bottom on a phone, the labels would collide; the panel below says the same.
          label: vertical ? undefined : e.label,
          focusable: false,
          className: on ? 'mk-trust-map-edge is-on' : 'mk-trust-map-edge',
          labelBgPadding: [7, 3] as [number, number],
          labelBgBorderRadius: 999,
        };
      }),
    [selected, vertical],
  );

  return (
    <ReactFlow
      key={layout.direction}
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      // A click handler is what keeps React Flow's non-draggable nodes clickable (it switches their
      // pointer events off otherwise); the button inside each box covers the keyboard.
      onNodeClick={(_, n) => onSelect(n.id as TrustMapNodeId)}
      fitView
      fitViewOptions={{ padding: vertical ? 0.04 : 0.06 }}
      minZoom={0.35}
      maxZoom={1.75}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      zoomOnPinch={!touch}
      panOnScroll={false}
      panOnDrag={!touch}
      preventScrolling={false}
      aria-label="Systems map"
    >
      <Controls showInteractive={false} position={vertical ? 'top-right' : 'bottom-left'} className="mk-trust-map-controls" />
    </ReactFlow>
  );
}
