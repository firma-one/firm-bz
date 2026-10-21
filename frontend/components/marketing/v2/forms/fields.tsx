'use client';

/**
 * Marketing v2 form fields (the sign-in board): a 15/600 label above a 48 px field with an 8 px radius
 * and the bottle-green focus ring with a 3 px halo. Inputs and textareas take the `mk-form-input` class
 * directly; selects are Radix (keyboard, typeahead and screen-reader support) dressed the same way.
 */
import type { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { AlertCircle, Check, ChevronDown, Star, TriangleAlert, type LucideIcon } from 'lucide-react';
import './forms.css';

/** Label (with an optional right-aligned note such as a character count), the control, a hint. */
export function FormField({
  id,
  label,
  note,
  hint,
  children,
  className = '',
}: {
  id: string;
  label: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {note ? (
        <div className="mk-form-labelrow">
          <label htmlFor={id} className="mk-form-label">
            {label}
          </label>
          {note}
        </div>
      ) : (
        <label htmlFor={id} className="mk-form-label">
          {label}
        </label>
      )}
      {children}
      {hint && <span className="mk-form-hint">{hint}</span>}
    </div>
  );
}

const ALERT_ICON = { error: AlertCircle, warn: TriangleAlert, note: Star } as const;

/** Inline message: `error` (validation or server), `warn` (couldn't check), `note` (good news). */
export function FormAlert({
  tone,
  icon,
  children,
  className = '',
}: {
  tone: 'error' | 'warn' | 'note';
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? ALERT_ICON[tone];
  return (
    <div role={tone === 'note' ? undefined : 'alert'} className={`mk-form-alert mk-form-alert--${tone} ${className}`}>
      <Icon size={17} strokeWidth={2.2} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A Radix select whose trigger matches the text fields; the menu opens below it. */
export function FormSelect({
  id,
  value,
  onChange,
  placeholder,
  children,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onChange}>
      <SelectPrimitive.Trigger id={id} className="mk-form-input mk-form-select">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={18} strokeWidth={2.2} className="mk-form-select__chev" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" side="bottom" sideOffset={6} className="mk-form-menu">
          <SelectPrimitive.Viewport className="mk-form-menu__viewport">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function FormSelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item value={value} className="mk-form-option">
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="mk-form-option__check">
        <Check size={16} strokeWidth={2.6} aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
