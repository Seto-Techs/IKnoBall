import { useState, type ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * Building blocks shared by the account page's sections: the panel shell, form
 * fields, buttons, the inline save result, the avatar and the team mark.
 */

/* ── Section wrapper ─────────────────────────────────────── */

export function SettingsCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-brand-line bg-white">
      <header className="border-b border-brand-line px-5 py-3.5">
        <h2 className="font-heading text-lg font-semibold uppercase tracking-wide text-brand-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-stone-500">{description}</p>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <footer className="flex items-center justify-end gap-2 border-t border-brand-line bg-stone-50/70 px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

/* ── Fields ──────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-brand-red">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-stone-400">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-brand-line bg-white px-3 py-2.5 text-sm text-brand-ink placeholder-stone-400 outline-none transition-colors focus:border-brand-navy focus:ring-1 focus:ring-brand-navy disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400';

/* ── Buttons ─────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  pending,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-brand-navyDark text-white hover:bg-brand-navy disabled:hover:bg-brand-navyDark',
    secondary:
      'border border-brand-line bg-white text-brand-ink hover:border-stone-300 hover:bg-stone-50',
    ghost: 'text-stone-600 hover:bg-stone-100 hover:text-brand-ink',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ── Feedback ────────────────────────────────────────────── */

/**
 * The result of the last save. Rendered inline next to the action rather than as
 * a toast, so it sits with the control that produced it and survives a scroll.
 */
export type SaveState = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

export function SaveHint({ state }: { state: SaveState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Saved
      </span>
    );
  }
  return <span className="text-xs font-medium text-brand-red">{state.message}</span>;
}

/* ── Team mark ───────────────────────────────────────────── */

/**
 * A team logo that degrades to its abbreviation.
 *
 * `TeamMark` falls back to the league mark only when a team has no `logoUrl` at
 * all; here a URL that fails to *load* needs the same treatment. Orbs cannot
 * reach `cdn.nba.com` (IPv6-first, no IPv6 egress), so without this the rail's
 * mark renders as a broken image in every orb screenshot.
 */
export function SafeTeamMark({
  logoUrl,
  abbr,
  alt,
  className = '',
}: {
  logoUrl?: string | null;
  abbr: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!logoUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center font-heading font-black uppercase tracking-tight text-stone-400 ${className}`}
      >
        {abbr}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  );
}

/* ── Avatar ──────────────────────────────────────────────── */

/** Initials for the fallback disc, matching the identity header's treatment. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  name,
  image,
  size = 64,
  className = '',
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-navyDark font-heading font-black uppercase text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name) || '?'}
    </span>
  );
}
