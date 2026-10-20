/**
 * The storage brands firmä runs on, as single-color outline marks (stroke only, `currentColor`), so they
 * sit quietly beside text in any color. Same 24-unit grid, stroke and joins as Lucide icons.
 *
 * Shapes that sit in front of others are filled with `surface` (the background they're drawn on) so the
 * outlines behind them don't show through; pass the band's color when it isn't white.
 */
import type { SVGProps } from 'react';

type IconProps = { size?: number; strokeWidth?: number; surface?: string } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function base({ size = 18, strokeWidth = 1.8, ...rest }: Omit<IconProps, 'surface'>) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

/** Google Drive: the triangle of three strips. */
export function GoogleDriveIcon({ surface: _surface, ...props }: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 10 6 20l-3-5L9 5z" />
      <path d="M9 15h12l-3 5H6" />
      <path d="M15 15 9 5h6l6 10z" />
    </svg>
  );
}

/** OneDrive: the cloud. */
export function OneDriveIcon({ surface: _surface, ...props }: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

/** SharePoint: three overlapping circles with the "S" tile in front. */
export function SharePointIcon({ surface = '#FFFFFF', strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg {...base({ strokeWidth, ...props })}>
      {/* Back to front: each circle covers the one behind it, as in the logo. */}
      <circle cx="14.6" cy="18.4" r="3.1" />
      <circle cx="18.4" cy="13.4" r="3.6" fill={surface} />
      <circle cx="14.2" cy="8.4" r="5.4" fill={surface} />
      <rect x="2" y="7" width="10" height="10" rx="2" fill={surface} />
      <path
        d="M8.8 9.9c-.4-.6-1.1-.9-1.8-.9-1 0-1.8.6-1.8 1.4 0 1.9 3.8 1.1 3.8 3.1 0 .9-.8 1.5-2 1.5-.8 0-1.5-.3-2-.9"
        strokeWidth={Math.max(1.2, strokeWidth - 0.3)}
      />
    </svg>
  );
}
