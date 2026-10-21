import 'server-only';

/**
 * Lays out the Trust Center's systems map with elkjs (the Eclipse Layout Kernel's layered algorithm),
 * on the server: the page is static, so this runs at build time and elkjs never ships to the browser.
 * The client map (React Flow) only draws the boxes at these positions.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { TRUST_MAP_EDGES, trustMapNodeSize, type TrustMapDirection, type TrustMapLayout, type TrustMapNode, type TrustMapNodeId } from './trust-map-data';

const elk = new ELK();

export async function layoutTrustMap(nodes: TrustMapNode[], direction: TrustMapDirection): Promise<TrustMapLayout> {
  const input: ElkNode = {
    id: 'trust-map',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      // Room between columns for the edge labels; tight rows on phones so three boxes fit side by side.
      'elk.layered.spacing.nodeNodeBetweenLayers': direction === 'RIGHT' ? '130' : '86',
      'elk.spacing.nodeNode': direction === 'RIGHT' ? '28' : '14',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      // Balanced alignment centers firmä between the boxes on either side, so its edges fan out evenly.
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: nodes.map((n) => ({ id: n.id, ...trustMapNodeSize(n, direction) })),
    edges: TRUST_MAP_EDGES.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const graph = await elk.layout(input);

  const positions = {} as TrustMapLayout['positions'];
  for (const child of graph.children ?? []) positions[child.id as TrustMapNodeId] = { x: child.x ?? 0, y: child.y ?? 0 };
  return { direction, width: graph.width ?? 0, height: graph.height ?? 0, positions };
}
