import type { SlateDay } from './slate';

export function WeekRail({
  days,
  activeKey,
  onSelect,
}: {
  days: SlateDay[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-line px-5 py-3">
        <h2 className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
          This Week
          <span className="ml-2 font-sans text-xs font-semibold normal-case tracking-normal text-stone-400">
            {days[0]?.label} &rarr; {days[days.length - 1]?.label}
          </span>
        </h2>
        <span className="hidden text-xs font-medium uppercase tracking-widest text-stone-400 sm:inline">
          Pick a day
        </span>
      </div>

      <div className="grid grid-cols-7 divide-x divide-brand-line">
        {days.map((day) => {
          const selected = day.key === activeKey;
          const empty = day.games.length === 0;
          const allPicked = !empty && day.picked === day.games.length;

          const cellTone = selected
            ? 'bg-brand-navyDark'
            : day.isToday
              ? 'bg-amber-50 hover:bg-amber-100'
              : 'bg-white hover:bg-stone-50';
          const labelTone = selected
            ? 'text-white/70'
            : day.isToday
              ? 'text-amber-700'
              : 'text-stone-500';
          const numberTone = selected
            ? 'text-white'
            : day.isToday
              ? 'text-amber-700'
              : 'text-brand-ink';

          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onSelect(day.key)}
              aria-pressed={selected}
              aria-controls="slate-day-panel"
              aria-label={`${day.label}, ${empty ? 'no games' : `${day.games.length} ${day.games.length === 1 ? 'game' : 'games'}, ${day.picked} picked`}`}
              className={`relative flex flex-col items-center gap-0.5 px-1 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy ${cellTone}`}
            >
              {day.isToday && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-0.5 ${selected ? 'bg-brand-gold' : 'bg-amber-400'}`}
                />
              )}
              <span className={`text-[10px] font-bold uppercase tracking-widest ${labelTone}`}>
                {day.weekday}
              </span>
              <span className={`font-heading text-2xl font-black leading-none ${numberTone}`}>
                {day.dayOfMonth}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${labelTone}`}>
                {day.month}
              </span>

              <span
                className={`mt-1 text-[10px] font-bold tabular-nums ${
                  empty
                    ? selected
                      ? 'text-white/40'
                      : 'text-stone-300'
                    : allPicked
                      ? selected
                        ? 'text-emerald-300'
                        : 'text-emerald-600'
                      : selected
                        ? 'text-white'
                        : 'text-brand-navy'
                }`}
              >
                {empty ? '—' : `${day.picked}/${day.games.length}`}
              </span>
              <span className={`text-[9px] font-medium uppercase tracking-wide ${labelTone}`}>
                {empty ? 'open' : day.games.length === 1 ? 'game' : 'games'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
