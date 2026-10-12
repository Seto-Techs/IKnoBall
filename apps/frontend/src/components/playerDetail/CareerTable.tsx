import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  PlayerSeason,
  PlayerSeasonStats,
  PlayerSeasonTeam,
  PlayerSeasonType,
} from '../../lib/api';
import { Panel } from '../dashboard/shared';

/** The columns a season row and its per-team splits both render. */
const COLUMNS: { label: string; value: (row: PlayerSeasonStats) => string }[] = [
  { label: 'GP', value: (r) => String(r.gp) },
  { label: 'PPG', value: (r) => (r.points == null ? '—' : r.points.toFixed(1)) },
  { label: 'RPG', value: (r) => (r.rebounds == null ? '—' : r.rebounds.toFixed(1)) },
  { label: 'APG', value: (r) => (r.assists == null ? '—' : r.assists.toFixed(1)) },
  { label: 'SPG', value: (r) => (r.steals == null ? '—' : r.steals.toFixed(1)) },
  { label: 'BPG', value: (r) => (r.blocks == null ? '—' : r.blocks.toFixed(1)) },
  { label: 'FG%', value: (r) => (r.fgPct == null ? '—' : (r.fgPct * 100).toFixed(1)) },
  { label: '3P%', value: (r) => (r.fg3Pct == null ? '—' : (r.fg3Pct * 100).toFixed(1)) },
  { label: 'FT%', value: (r) => (r.ftPct == null ? '—' : (r.ftPct * 100).toFixed(1)) },
];

/** A season has two rows (regular season and playoffs), so both identify one. */
const rowKey = (row: { season: string; seasonType: PlayerSeasonType }) =>
  `${row.season}-${row.seasonType}`;

/** A season has three kinds of row, and the table shows one kind at a time. */
const SEASON_TYPES: { key: PlayerSeasonType; label: string }[] = [
  { key: 'regular', label: 'Regular Season' },
  { key: 'playoffs', label: 'Playoffs' },
  { key: 'preseason', label: 'Preseason' },
];

/**
 * Pick which kind of season the table lists. A dropdown rather than tabs because
 * there are three kinds and the label carries the row count, which a tab cannot
 * show without looking like navigation.
 */
function SeasonTypeMenu({
  value,
  counts,
  onChange,
}: {
  value: PlayerSeasonType;
  counts: Record<PlayerSeasonType, number>;
  onChange: (next: PlayerSeasonType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const active = SEASON_TYPES.find((option) => option.key === value) ?? SEASON_TYPES[0];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="season-type-menu"
        aria-label={`Season type: ${active.label}`}
        className="flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-2 text-[11px] font-black uppercase tracking-widest text-brand-navy transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        <span>{active.label}</span>
        <span className="tabular-nums text-stone-500">{counts[value] ?? 0}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="season-type-menu"
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[230px] overflow-hidden rounded-lg border border-brand-line bg-white shadow-lg"
        >
          {SEASON_TYPES.map((option) => {
            const selected = option.key === value;
            const count = counts[option.key] ?? 0;
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  onChange(option.key);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                  selected ? 'bg-brand-navy/5' : 'hover:bg-stone-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-brand-ink">{option.label}</span>
                  <span className="block text-[11px] text-stone-500">
                    {count} {count === 1 ? 'season' : 'seasons'}
                  </span>
                </span>
                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-brand-navy" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The stat cells of a row, shared by a season and its team splits. */
function StatCells({ row, className }: { row: PlayerSeasonStats; className: string }) {
  return (
    <>
      {COLUMNS.map((column) => (
        <td key={column.label} className={`px-2 py-2 text-right tabular-nums ${className}`}>
          {column.value(row)}
        </td>
      ))}
    </>
  );
}

/**
 * One team's share of a season, indented under the season row it belongs to. The
 * colour bar, logo and abbreviation say which stretch of the season it covers.
 */
function TeamSplitRow({ team }: { team: PlayerSeasonTeam }) {
  return (
    <tr className="border-b border-brand-line bg-stone-50/70 last:border-b-0">
      <th scope="row" className="py-1.5 pl-7 pr-3 text-left font-normal">
        <span className="flex items-center gap-2">
          <span
            className="h-4 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: team.primaryColor || '#E8E3DD' }}
            aria-hidden="true"
          />
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              className="h-5 w-5 shrink-0 object-contain"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
            />
          ) : null}
          <span className="font-heading text-sm font-black uppercase tracking-wide text-brand-ink">
            {team.teamAbbr}
          </span>
          {team.teamName ? (
            <span className="truncate text-xs text-stone-500">{team.teamName}</span>
          ) : null}
        </span>
      </th>
      <StatCells row={team} className="text-stone-600" />
    </tr>
  );
}

/**
 * Season-by-season averages, split into regular season and playoffs. A season the
 * player spent on more than one team opens up to that season's per-team splits,
 * which appear nowhere else — the combined row above them is the total across
 * teams.
 */
export function CareerPanel({ seasons }: { seasons: PlayerSeason[] }) {
  const [type, setType] = useState<PlayerSeasonType>('regular');
  const [expanded, setExpanded] = useState<string[]>([]);

  const byType = (wanted: PlayerSeasonType) => seasons.filter((s) => s.seasonType === wanted);
  const rows = byType(type);
  const counts = {
    regular: byType('regular').length,
    playoffs: byType('playoffs').length,
    preseason: byType('preseason').length,
  };

  const toggle = (key: string) =>
    setExpanded((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const emptyMessage =
    type === 'playoffs'
      ? 'No playoff games on file.'
      : type === 'preseason'
        ? 'No preseason games on file.'
        : 'No season stats on file yet.';

  return (
    <Panel title="Career">
      <div className="flex flex-col gap-4 px-5 py-4">
        <SeasonTypeMenu value={type} counts={counts} onChange={setType} />

        {rows.length === 0 ? (
          <p className="text-sm text-stone-400">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-brand-line text-xs font-bold uppercase tracking-widest text-stone-500">
                  <th scope="col" className="py-1.5 pr-3 text-left font-bold">
                    Season
                  </th>
                  {COLUMNS.map((column) => (
                    <th key={column.label} scope="col" className="px-2 py-1.5 text-right font-bold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* One body per season, so `aria-controls` has a real target and a
                  season's splits stay grouped with the row that opened them. */}
              {rows.map((row) => {
                const key = rowKey(row);
                const open = expanded.includes(key);
                const splits = row.teams;
                const expandable = splits.length > 0;
                const splitsId = `career-splits-${key}`;
                return (
                  <tbody key={key} id={splitsId}>
                    <tr className={`border-b border-brand-line ${open ? 'border-b-0' : ''}`}>
                      <th scope="row" className="py-2 pr-3 text-left">
                        {expandable ? (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={open}
                            aria-controls={splitsId}
                            className="flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                          >
                            {open ? (
                              <ChevronDown
                                className="h-4 w-4 shrink-0 text-stone-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-stone-500"
                                aria-hidden="true"
                              />
                            )}
                            <span className="font-heading text-sm font-black uppercase tracking-wide text-brand-ink">
                              {row.season}
                            </span>
                            <span className="text-xs font-semibold text-stone-500">
                              {splits.length} teams
                            </span>
                          </button>
                        ) : (
                          <span className="block pl-[22px] font-heading text-sm font-black uppercase tracking-wide text-brand-ink">
                            {row.season}
                          </span>
                        )}
                      </th>
                      <StatCells row={row} className="text-brand-ink" />
                    </tr>

                    {expandable && open
                      ? splits.map((team) => (
                          <TeamSplitRow key={`${key}-${team.teamAbbr}`} team={team} />
                        ))
                      : null}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
