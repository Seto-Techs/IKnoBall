import { useState, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { Club } from '../lib/teams';

/* ── Marks ────────────────────────────────────────────────────
 * The league's own artwork, shown as it comes: no circular crop, no ring, no
 * border. A team mark is a logo, not an avatar, and boxing it in a circle cuts
 * the one thing that makes it recognisable. Its height tracks the text beside
 * it so a row reads as one line rather than as a picture with a caption.
 */

export function TeamMark({ club, size = 32 }: { club: Club; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (club.logoUrl && !failed) {
    return (
      <img
        src={club.logoUrl}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center font-heading font-bold uppercase text-stone-400"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {club.abbreviation}
    </span>
  );
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({
  name,
  image,
  size = 40,
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
        className={`shrink-0 rounded-full bg-stone-100 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-navyDark font-heading font-bold uppercase text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name) || '?'}
    </span>
  );
}

/* ── Surfaces ─────────────────────────────────────────────── */

export function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-brand-line bg-white ${className}`}
    >
      <h2 className="border-b border-brand-line bg-stone-50 px-4 py-2 font-heading text-[15px] font-semibold uppercase tracking-[0.12em] text-brand-navyDark">
        {title}
      </h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-stone-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-4 text-brand-red" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-sm font-medium leading-snug">{message}</p>
    </div>
  );
}

export function EmptyNote({ message }: { message: string }) {
  return <p className="p-6 text-center text-sm leading-relaxed text-stone-500">{message}</p>;
}
