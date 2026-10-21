'use client';

/**
 * The tour card's green mesh. The board drifts it with `background-position`; here an oversized layer
 * drifts by transform instead (same path, on the compositor), and the loop pauses while off screen.
 */
import { useOnScreen } from '../motion';

export function ProofMesh() {
  const [ref, on] = useOnScreen<HTMLDivElement>();
  return <div ref={ref} aria-hidden="true" className="mk-proof-mesh" style={{ animationPlayState: on ? 'running' : 'paused' }} />;
}
