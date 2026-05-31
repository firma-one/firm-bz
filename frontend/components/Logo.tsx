import React from 'react';
import { BRAND_NAME, BRAND_LOGO_COLOR } from '@/config/brand';
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon';
import { BrandName } from '@/components/brand/BrandName';
import { cn } from '@/lib/utils';

const DEFAULT_BRAND_COLOR = BRAND_LOGO_COLOR;

/** Neon CTA green — prominent circular separators in the default tagline. */
const TAGLINE_DOT_CLASS =
  'inline-block h-1 w-1 shrink-0 rounded-full bg-[#72ff70]';

export interface OrganizationBranding {
  logoUrl?: string | null;
  logoAspectRatio?: string | null;
  name?: string | null;
  subtext?: string | null;
  themeColor?: string | null;
  secondaryColor?: string | null;
  website?: string | null;
}

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  /** Merged onto `BrandName` for the default platform lockup (e.g. `text-2xl` in the global header). */
  wordmarkClassName?: string;
  /** Light wordmark + lime mark for dark kinetic surfaces (e.g. auth). */
  variant?: 'default' | 'onDark';
  /** When set, replaces default platform branding with org logo/name/theme. */
  branding?: OrganizationBranding | null;
}

const DEFAULT_DISPLAY_NAME = BRAND_NAME;

function BrandNameOrCustom({
  displayName,
  className,
  style,
}: {
  displayName: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (displayName === BRAND_NAME) {
    return <BrandName className={className} style={style} />;
  }
  return (
    <span className={className} style={style}>
      {displayName}
    </span>
  );
}

function DefaultTagline({ onDark }: { onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium leading-tight tracking-wide sm:text-[11px] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] ${onDark ? 'text-slate-400' : 'text-[#45474c]'}`}
    >
      <span>Organize</span>
      <span aria-hidden className={TAGLINE_DOT_CLASS} />
      <span>Protect</span>
      <span aria-hidden className={TAGLINE_DOT_CLASS} />
      <span>Deliver</span>
    </span>
  );
}

export default function Logo({
  className = '',
  size = 'md',
  showText = true,
  wordmarkClassName,
  variant = 'default',
  branding,
}: LogoProps) {
  const iconSizes: Record<string, string> = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
    xl: 'h-[50px] w-[50px]',
  };

  const textSizes: Record<string, string> = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-xl',
  };

  const useBranding = branding?.logoUrl ?? branding?.name ?? branding?.themeColor;
  const themeColorTrimmed = branding?.themeColor?.trim() || '';
  const themeHex = themeColorTrimmed.match(/^#[0-9A-Fa-f]{6}$/) ? themeColorTrimmed : DEFAULT_BRAND_COLOR;

  const brandNameClass = useBranding
    ? `${textSizes[size]} font-semibold`
    : `${textSizes[size]} font-semibold`;

  const brandNameColor = useBranding ? '#1C1918' : (themeHex || DEFAULT_BRAND_COLOR);

  const displayName = (useBranding && branding?.name) ? branding.name : DEFAULT_DISPLAY_NAME;
  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : 'P';

  const hasSubtextRow = useBranding && branding?.subtext;
  const logoHeightsPx: Record<string, number> = { sm: 24, md: 32, lg: 40, xl: 50 }
  const logoHeights: Record<string, string> = { sm: 'h-6', md: 'h-8', lg: 'h-10', xl: 'h-[50px]' }
  const arMap: Record<string, number> = { '4:3': 4/3, '16:9': 16/9 }
  const logoAr = branding?.logoAspectRatio && arMap[branding.logoAspectRatio] ? arMap[branding.logoAspectRatio] : 1
  const logoW = Math.round(logoHeightsPx[size] * logoAr)
  const logoContainerClass = useBranding && branding?.logoUrl
    ? `inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-50 border-2 border-slate-100 overflow-hidden ${logoHeights[size]}`
    : '';
  const bubbleClass = useBranding && !branding?.logoUrl
    ? `inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-black bg-slate-50 border-2 border-slate-100 ${iconSizes[size]}`
    : '';

  const isDefaultPlatformBrand = !useBranding && displayName === DEFAULT_DISPLAY_NAME;

  const brandTextSize =
    size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : size === 'lg' ? 'text-base' : 'text-lg';

  // Default platform brand: square-function mark + wordmark + tagline.
  // `group` lets `BrandName` / `BrandMarkIcon` use `group-hover:` for the full lockup.
  if (showText && isDefaultPlatformBrand) {
    return (
      <div
        className={cn('group inline-flex min-w-0 flex-col justify-center gap-0.5', className)}
        style={useBranding && themeHex ? { ['--logo-theme' as string]: themeHex } : undefined}
      >
        <span
          className={cn(
            'inline-flex min-w-0 shrink-0 items-center gap-2 leading-none',
            wordmarkClassName ?? brandTextSize,
          )}
        >
          <BrandMarkIcon
            variant={variant === 'onDark' ? 'onDark' : 'default'}
            className="h-[0.88em] w-[0.88em]"
          />
          <BrandName
            gradient={variant !== 'onDark'}
            className={cn('min-w-0', variant === 'onDark' && '!text-white')}
          />
        </span>
        <div className="min-w-0 self-start">
          <DefaultTagline onDark={variant === 'onDark'} />
        </div>
      </div>
    );
  }

  const containerProps = {
    className: cn(
      'group',
      hasSubtextRow ? `flex items-center gap-3 ${className}` : `inline-flex items-center ${className}`,
    ),
    style: useBranding && themeHex ? { ['--logo-theme' as string]: themeHex } : undefined,
  };

  const inner = (
    <>
      <div className="inline-flex shrink-0 items-center">
        {useBranding && branding?.logoUrl ? (
          <span className={logoContainerClass} style={{ width: logoW }}>
            <img
              src={branding.logoUrl}
              alt=""
              className="h-full w-full object-contain"
              style={{ color: themeHex }}
            />
          </span>
        ) : useBranding ? (
          <span
            className={bubbleClass}
            style={{ fontSize: size === 'xl' ? '1.5rem' : size === 'lg' ? '1.25rem' : size === 'md' ? '1rem' : '0.875rem', color: themeHex }}
          >
            {initial}
          </span>
        ) : (
          <span className={cn('inline-flex items-center gap-1.5', textSizes[size], wordmarkClassName)}>
            <BrandMarkIcon className="h-[0.9em] w-[0.9em]" />
            <BrandName className="min-w-0 leading-none" />
          </span>
        )}
      </div>
      {showText && (
        hasSubtextRow ? (
          <div className="flex min-w-0 flex-col justify-center overflow-hidden">
            <BrandNameOrCustom
              displayName={displayName}
              className={`${brandNameClass} leading-tight truncate`}
              style={useBranding ? { color: brandNameColor } : (themeHex ? { color: themeHex } : undefined)}
            />
            <span className="mt-0.5 text-[11px] leading-tight text-gray-500 truncate" title={branding!.subtext ?? undefined}>
              {branding!.subtext}
            </span>
          </div>
        ) : (
          <div className="ml-2 min-w-0 inline-flex items-center overflow-hidden">
            <BrandNameOrCustom
              displayName={displayName}
              className={`${brandNameClass} truncate`}
              style={useBranding ? { color: brandNameColor } : (themeHex ? { color: themeHex } : undefined)}
            />
            {useBranding && branding?.subtext && (
              <span className="ml-2 hidden text-sm text-gray-500 sm:inline">{branding.subtext}</span>
            )}
          </div>
        )
      )}
    </>
  );

  if (useBranding && branding?.website) {
    return (
      <a href={branding.website} target="_blank" rel="noopener noreferrer" aria-label={displayName} {...containerProps}>
        {inner}
      </a>
    );
  }

  return <div {...containerProps}>{inner}</div>;
}
