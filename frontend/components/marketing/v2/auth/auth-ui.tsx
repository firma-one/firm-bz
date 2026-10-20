'use client';

/**
 * Presentational pieces shared by the sign-in view and the sign-up form's `mk` layout: the labeled
 * field, the verified check, the back link, the divider, messages and the provider marks. No auth
 * logic lives here; callers pass their own handlers and state. Styles: ./auth.css.
 */
import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

/** Label (15/600) above a 48 px control, an optional action at the label's right, and a hint below. */
export function AuthField({
  id,
  label,
  labelAction,
  hint,
  end,
  disabled,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  labelAction?: ReactNode;
  hint?: ReactNode;
  /** Shown inside the control at its right edge (e.g. the verified check). */
  end?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** The `<input className="mk-auth-input">` itself. */
  children: ReactNode;
}) {
  return (
    <div className={`mk-auth-field${className ? ` ${className}` : ''}`}>
      <div className="mk-auth-label-row">
        <label htmlFor={id} className="mk-auth-label">
          {label}
        </label>
        {labelAction}
      </div>
      <div
        className="mk-auth-control"
        data-disabled={disabled || undefined}
        onClick={(e) => {
          // The padding around the input focuses it too.
          if (e.target === e.currentTarget) e.currentTarget.querySelector('input')?.focus();
        }}
      >
        {children}
        {end}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mk-auth-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The bottle-green check that pops into a field once its value is confirmed (decorative). */
export function AuthFieldCheck({ on }: { on: boolean }) {
  return (
    <span className="mk-auth-check" data-on={on || undefined} aria-hidden>
      <Check width={17} height={17} strokeWidth={3} />
    </span>
  );
}

export function AuthBack({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="mk-auth-back">
      <ChevronLeft width={14} height={14} strokeWidth={2.4} aria-hidden />
      Back
    </button>
  );
}

/** The chevron that trails a primary pill (nudges right on hover via `.mk-btn`). */
export function AuthChevron() {
  return <ChevronRight width={14} height={14} strokeWidth={2.6} aria-hidden />;
}

export function AuthDivider({ children }: { children: ReactNode }) {
  return <div className="mk-auth-divider">{children}</div>;
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mk-auth-alert">
      {children}
    </div>
  );
}

/** A neutral note with a next step ("No account found for this email. Sign up"). */
export function AuthNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mk-auth-note">
      {children}
    </p>
  );
}

export function GoogleMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function MicrosoftMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <rect x="0" y="0" width="8" height="8" fill="#F25022" />
      <rect x="10" y="0" width="8" height="8" fill="#7FBA00" />
      <rect x="0" y="10" width="8" height="8" fill="#00A4EF" />
      <rect x="10" y="10" width="8" height="8" fill="#FFB900" />
    </svg>
  );
}
