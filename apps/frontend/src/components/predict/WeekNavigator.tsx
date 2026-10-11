import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SlateDay } from './slate';
import { formatWeekRangeLabel, relativeWeekLabel } from './week';

function ArrowButton({
  direction,
  onClick,
  className,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  className?: string;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous week' : 'Next week'}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-ink transition hover:bg-stone-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${className ?? ''}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * One day cell. Carries the day, how many of its games are picked, and how the
 * settled picks went, so a past week reads as a result sheet rather than a
 * calendar.
 */
function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: SlateDay;
  selected: boolean;
  onSelect: () => void;
}) {
  const empty = day.games.length === 0;
  const missed = day.settled - day.correct;

  const cellTone = selected
    ? 'bg-brand-navyDark'
    : day.isToday
      ? 'bg-amber-50 hover:bg-amber-100'
      : 'bg-white hover:bg-stone-50';
  const labelTone = selected ? 'text-white/70' : day.isToday ? 'text-amber-700' : 'text-stone-500';
  const numberTone = selected ? 'text-white' : day.isToday ? 'text-amber-700' : 'text-brand-ink';

  // Coverage stays neutral: green and red are reserved for how picks resolved, so
  // a green "1/1" never reads as a correct pick.
  const countTone = empty
    ? selected
      ? 'text-white/40'
      : 'text-stone-300'
    : selected
      ? 'text-white/85'
      : 'text-stone-600';

  // A day that has resolved picks gets a result line instead of the "games"
  // caption; the caption only earns its space while nothing has settled.
  const resultTone = selected ? 'text-emerald-300' : 'text-emerald-600';
  const missTone = selected ? 'text-red-300' : 'text-brand-red';

  return (
    <button
      key={day.key}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-controls="slate-day-panel"
      aria-label={`${day.label}, ${empty ? 'no games' : `${day.games.length} ${day.games.length === 1 ? 'game' : 'games'}, ${day.picked} picked${day.settled > 0 ? `, ${day.correct} correct, ${day.settled - day.correct} missed` : ''}`}`}
      // The two stacked figures read as "picked of games" then "correct/missed";
      // spell that out on hover, since the rail is too narrow to label them.
      title={
        empty
          ? `${day.label} · no games`
          : `${day.label} · ${day.picked} of ${day.games.length} picked${
              day.settled > 0
                ? ` · ${day.correct} correct, ${day.settled - day.correct} missed`
                : ''
            }`
      }
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

      <span className={`mt-1 text-[10px] font-bold tabular-nums ${countTone}`}>
        {empty ? '—' : `${day.picked}/${day.games.length}`}
      </span>

      {day.settled > 0 ? (
        <span className="flex items-center gap-1 text-[9px] font-black tabular-nums">
          <span className={resultTone}>{day.correct}✓</span>
          <span className={missed > 0 ? missTone : selected ? 'text-white/40' : 'text-stone-300'}>
            {missed}✗
          </span>
        </span>
      ) : (
        <span className={`text-[9px] font-medium uppercase tracking-wide ${labelTone}`}>
          {empty ? 'no games' : day.games.length === 1 ? 'game' : 'games'}
        </span>
      )}
    </button>
  );
}

/**
 * The week strip: a Sunday-to-Saturday rail with arrows to walk back through
 * past weeks, so settled picks stay reachable after the seven-day window moves
 * on.
 */
export function WeekNavigator({
  days,
  activeKey,
  onSelect,
  weekOffset,
  onShiftWeek,
  onCurrentWeek,
  actions,
  busy = false,
}: {
  days: SlateDay[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** 0 is this week, -1 last week, 1 next week. */
  weekOffset: number;
  onShiftWeek: (delta: -1 | 1) => void;
  onCurrentWeek: () => void;
  /** Extra controls for the header, between the jump button and the next arrow. */
  actions?: ReactNode;
  /** A week change is in flight — usually a skip across empty weeks. */
  busy?: boolean;
}) {
  const startKey = days[0]?.key ?? '';
  const endKey = days[days.length - 1]?.key ?? '';
  const relative = relativeWeekLabel(weekOffset);

  return (
    <div className="relative rounded-xl border border-brand-line bg-white shadow-sm">
      {/*
        One flex container, wrapped by `order`. Narrow screens put the arrows and
        the date on the first row and drop the controls to a full-width second
        row, which is the only way the range label escapes the ellipsis. Desktop
        collapses back to a single row with the controls before the next arrow.
      */}
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-line px-2 py-2 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-3">
        <ArrowButton direction="prev" onClick={() => onShiftWeek(-1)} className="order-1" />

        <div className="order-2 min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h2 className="font-heading text-base font-black uppercase tracking-wide text-brand-ink sm:text-xl">
              {formatWeekRangeLabel(startKey, endKey)}
            </h2>
            {relative && (
              <span className="rounded-full bg-brand-navy/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-brand-navy">
                {relative}
              </span>
            )}
          </div>
          <p className="mt-0.5 hidden text-[11px] font-medium uppercase tracking-widest text-stone-400 sm:block">
            {weekOffset < 0 ? 'Results' : weekOffset > 0 ? 'Schedule' : 'Pick a day'}
          </p>
        </div>

        <div className="order-4 flex w-full items-center justify-center gap-2 sm:order-3 sm:ml-auto sm:w-auto sm:justify-end">
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={onCurrentWeek}
              className="shrink-0 rounded-lg border border-brand-line px-3 py-2 text-[11px] font-black uppercase tracking-widest text-brand-navy transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              This week
            </button>
          )}

          {actions}
        </div>

        <ArrowButton
          direction="next"
          onClick={() => onShiftWeek(1)}
          className="order-3 sm:order-4"
        />
      </div>

      <div
        className={`grid grid-cols-7 divide-x divide-brand-line overflow-hidden rounded-b-xl transition-opacity ${
          busy ? 'pointer-events-none opacity-50' : ''
        }`}
        aria-busy={busy}
      >
        {days.map((day) => (
          <DayCell
            key={day.key}
            day={day}
            selected={day.key === activeKey}
            onSelect={() => onSelect(day.key)}
          />
        ))}
      </div>
    </div>
  );
}
