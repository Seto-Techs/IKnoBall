import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlayerSeasonType } from '../../lib/api';

/** The three kinds of season a player's page can show, in reading order. */
export const SEASON_TYPES: { key: PlayerSeasonType; label: string }[] = [
  { key: 'regular', label: 'Regular Season' },
  { key: 'playoffs', label: 'Playoffs' },
  { key: 'preseason', label: 'Preseason' },
];

export interface SeasonOption {
  /** Stable identity for the option, used as the selected value. */
  key: string;
  /** The option's name, e.g. "Regular Season" or "2025-26 · Playoffs". */
  label: string;
  /** Optional supporting line, e.g. "9 seasons" or "1403 attempts". */
  subtitle?: string;
  /** Listed but not selectable, when there is nothing behind it. */
  disabled?: boolean;
}

/**
 * Pick which slice of a player's seasons a panel shows.
 *
 * A dropdown rather than tabs because the options carry a supporting line a tab
 * has no room for — the career table puts a season count there, the shot-zone
 * chart an attempt count — and because the two panels need different axes: one
 * picks a season type, the other a season and a type together. Taking the
 * options as a prop lets both use this without a second copy of the outside-click
 * and keyboard handling.
 */
export function SeasonPicker({
  value,
  options,
  onChange,
  ariaLabel = 'Season',
}: {
  value: string;
  options: readonly SeasonOption[];
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Two pickers sit side by side on a player page, so the menu id has to be
  // per-instance or both triggers would point at the same element.
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = options.find((option) => option.key === value) ?? options[0];
  if (!active) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`${ariaLabel}: ${active.label}`}
        className="flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-2 text-[11px] font-black uppercase tracking-widest text-brand-navy transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        <span>{active.label}</span>
        {active.subtitle && <span className="tabular-nums text-stone-500">{active.subtitle}</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          // Tall lists (a season and type per year) scroll rather than run off the
          // page; short ones size to their content.
          className="absolute left-0 top-full z-50 mt-2 max-h-[340px] w-[250px] overflow-y-auto overscroll-contain rounded-lg border border-brand-line bg-white shadow-lg"
        >
          {options.map((option) => {
            const selected = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={option.disabled}
                onClick={() => {
                  setOpen(false);
                  onChange(option.key);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                  option.disabled
                    ? 'cursor-not-allowed opacity-45'
                    : selected
                      ? 'bg-brand-navy/5'
                      : 'hover:bg-stone-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-brand-ink">
                    {option.label}
                  </span>
                  {option.subtitle && (
                    <span className="block text-[11px] text-stone-500">{option.subtitle}</span>
                  )}
                </span>
                {selected && (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-brand-navy">
                    Showing
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
