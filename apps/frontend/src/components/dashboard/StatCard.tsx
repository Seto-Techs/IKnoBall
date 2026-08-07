import { type ReactNode } from 'react';

export function StatCard({
  icon,
  label,
  value,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  caption: string;
}) {
  return (
    <div className="flex h-36 flex-col justify-between rounded-xl border border-brand-line bg-white p-5">
      <div className="flex items-center gap-3 text-brand-red">
        {icon}
        <span className="text-sm font-medium uppercase tracking-wide text-stone-500">{label}</span>
      </div>
      <div>
        <p className="font-heading text-3xl font-semibold leading-none text-brand-ink">{value}</p>
        <p className="mt-2 text-sm text-stone-500">{caption}</p>
      </div>
    </div>
  );
}
