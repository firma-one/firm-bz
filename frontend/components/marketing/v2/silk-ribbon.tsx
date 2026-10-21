'use client';

/**
 * Silk ribbon: firmä's motion signature (marketing hero and the auth pages).
 *
 * A ribbon of fine threads on a cubic Bézier centerline that twists around an off-center axis, with
 * perspective, a per-thread gradient through the green palette, back faces shaded toward bottle green
 * and a soft sheen at each fold. Drawn on a 2D canvas at 30 fps. It never blocks the page: the canvas
 * is decorative (aria-hidden), stops drawing while off-screen or while the tab is hidden, uses about
 * two-thirds of the threads on phones, and shows one still frame when motion is reduced.
 *
 * Geometry is in units of the canvas width, so the shape holds at every size. `anchor: 'bottom'`
 * measures y up from the bottom edge (for ribbons that hug the lower part of a section).
 */
import { useEffect, useRef } from 'react';

export type RibbonSpec = {
  /** Four Bézier control points [x, y], in units of the canvas width. */
  p: [number, number][];
  /** Ribbon width, in units of the canvas width. */
  width: number;
  /** Half-turns along the length. */
  turns: number;
  phase: number;
  /** Twist axis offset across the ribbon (-0.5..0.5); off-center avoids a pinched bow tie. */
  axis?: number;
  lines?: number;
  steps?: number;
  hue: number;
  spread: number;
  across: number;
  alpha?: number;
};

export type RibbonConfig = {
  anchor: 'top' | 'bottom';
  /** Start time in seconds, so the first frame is already a good-looking fold. */
  t0?: number;
  pal: string[];
  deep: string;
  ribbons: RibbonSpec[];
};

export const RIBBON_PALETTE = ['#7DFF77', '#2EE6C5', '#00C49A', '#009669', '#00C49A', '#ECFF8F', '#A6FF7A'];

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mix = (c: RGB, d: RGB, k: number): RGB => [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k];

function paletteColor(pal: RGB[], h: number): RGB {
  const n = pal.length;
  const x = (((h % 1) + 1) % 1) * n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  const e = f * f * (3 - 2 * f);
  return mix(pal[i], pal[(i + 1) % n], e);
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  rb: RibbonSpec,
  cfg: RibbonConfig,
  pal: RGB[],
  deep: RGB,
  W: number,
  H: number,
  t: number,
  density: number,
) {
  const U = W;
  const px = (p: [number, number]) => p[0] * W;
  const py = (p: [number, number]) => (cfg.anchor === 'bottom' ? H - p[1] * U : p[1] * U);
  const sway = (a: number, b: number, c: number) => Math.sin(t * a + b) * c * U;
  const P = [
    [px(rb.p[0]) + sway(0.13, 0, 0.012), py(rb.p[0]) + sway(0.11, 1, 0.01)],
    [px(rb.p[1]) + sway(0.21, 1, 0.035), py(rb.p[1]) + sway(0.17, 2, 0.03)],
    [px(rb.p[2]) + sway(0.19, 3, 0.035), py(rb.p[2]) + sway(0.23, 4, 0.03)],
    [px(rb.p[3]) + sway(0.15, 5, 0.012), py(rb.p[3]) + sway(0.12, 6, 0.01)],
  ];
  const M = rb.steps ?? 110;
  const N = Math.max(12, Math.round((rb.lines ?? 120) * density));
  const axis = rb.axis ?? -0.35;
  const cx = new Float32Array(M + 1);
  const cy = new Float32Array(M + 1);
  const nx = new Float32Array(M + 1);
  const ny = new Float32Array(M + 1);
  const cs = new Float32Array(M + 1);
  const sn = new Float32Array(M + 1);
  const wd = new Float32Array(M + 1);
  const base = rb.width * U;
  for (let i = 0; i <= M; i++) {
    const s = i / M;
    const a = 1 - s;
    cx[i] = a * a * a * P[0][0] + 3 * a * a * s * P[1][0] + 3 * a * s * s * P[2][0] + s * s * s * P[3][0];
    cy[i] = a * a * a * P[0][1] + 3 * a * a * s * P[1][1] + 3 * a * s * s * P[2][1] + s * s * s * P[3][1];
    const dx = 3 * a * a * (P[1][0] - P[0][0]) + 6 * a * s * (P[2][0] - P[1][0]) + 3 * s * s * (P[3][0] - P[2][0]);
    const dy = 3 * a * a * (P[1][1] - P[0][1]) + 6 * a * s * (P[2][1] - P[1][1]) + 3 * s * s * (P[3][1] - P[2][1]);
    const len = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / len;
    ny[i] = dx / len;
    const ph = Math.PI * rb.turns * s + rb.phase + t * 0.16 + 0.6 * Math.sin(t * 0.13);
    cs[i] = Math.cos(ph);
    sn[i] = Math.sin(ph);
    wd[i] = base * (0.8 + 0.3 * Math.sin(Math.PI * s));
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Threads overlap slightly so no moiré shows between them.
  ctx.lineWidth = Math.max(1, (base / N) * 1.3);
  const K = 12;
  for (let j = 0; j < N; j++) {
    const u = j / (N - 1) - 0.5;
    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    ctx.beginPath();
    for (let i = 0; i <= M; i++) {
      const s = i / M;
      const persp = 1 / (1 - 0.45 * (u - axis) * sn[i]);
      const off = (axis + (u - axis) * cs[i] * persp) * wd[i] + Math.sin(s * 6.5 + u * 5 + t * 0.7) * U * 0.004;
      const x = cx[i] + nx[i] * off;
      const y = cy[i] + ny[i] * off;
      if (i === 0) {
        ctx.moveTo(x, y);
        x0 = x;
        y0 = y;
      } else ctx.lineTo(x, y);
      if (i === M) {
        x1 = x;
        y1 = y;
      }
    }
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let k = 0; k <= K; k++) {
      const s = k / K;
      const c = cs[Math.round(s * M)];
      let col = paletteColor(pal, rb.hue + s * rb.spread + (u + 0.5) * rb.across + t * 0.02);
      if (j % 2) col = mix(col, deep, 0.06);
      // Back faces turn toward bottle green; a white sheen marks each fold.
      if (c < 0) col = mix(col, deep, 0.45 * -c);
      col = mix(col, [255, 255, 255], Math.pow(1 - Math.abs(c), 12) * 0.6);
      g.addColorStop(s, `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`);
    }
    ctx.strokeStyle = g;
    ctx.globalAlpha = (rb.alpha ?? 0.95) - Math.pow(Math.abs(2 * u), 12) * 0.6;
    ctx.stroke();
  }
}

export function SilkRibbon({
  config,
  className,
  style,
  animate = true,
}: {
  config: RibbonConfig;
  className?: string;
  style?: React.CSSProperties;
  /** Off shows the still frame. Reduced motion always shows the still frame. */
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const pal = config.pal.map(hexToRgb);
    const deep = hexToRgb(config.deep);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const live = animate && !reduce;
    const born = performance.now();
    let raf = 0;
    let last = 0;
    let visible = true;
    let drawnStill = false;

    const draw = (t: number) => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
        el.width = Math.round(W * dpr);
        el.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Phones draw about two-thirds of the threads.
      const density = W < 768 ? 0.66 : 1;
      config.ribbons.forEach((rb, r) => drawRibbon(ctx, rb, config, pal, deep, W, H, t + r * 7.3, density));
      ctx.globalAlpha = 1;
      return true;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < 33) return;
      last = now;
      draw((config.t0 ?? 0) + (now - born) / 1000);
    };

    const still = () => {
      drawnStill = draw(config.t0 ?? 0);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(el);

    let ro: ResizeObserver | undefined;
    if (live) {
      raf = requestAnimationFrame(loop);
    } else {
      still();
      // Redraw the still frame when the canvas changes size (or first gets a size).
      ro = new ResizeObserver(() => {
        if (!drawnStill || el.width !== Math.round(el.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) still();
      });
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro?.disconnect();
    };
  }, [config, animate]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ display: 'block', pointerEvents: 'none', ...style }} />;
}
