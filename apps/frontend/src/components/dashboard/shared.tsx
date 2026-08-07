import { format } from 'date-fns';

import type { ReactNode } from 'react';

/* ── Panels ──────────────────────────────────────────────── */

export function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-lg border border-brand-line bg-white ${className ?? ''}`}>
      <h2 className="border-b border-brand-line px-5 py-3 font-heading text-2xl font-semibold uppercase tracking-wide text-brand-ink">
        {title}
      </h2>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8" role="status">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-navy" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-base text-stone-600">{message}</p>
    </div>
  );
}
/* ── Helpers ─────────────────────────────────────────────── */

export function formatGameDate(value: string, pattern: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, pattern);
}
