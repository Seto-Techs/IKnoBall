import { useState } from 'react';
import type { BoxScore, BoxScorePlayer, BoxScoreSide } from '../../lib/api';
import { distinctPair, type ColorPair } from '../../lib/color';

/* ── Formatting ─────────────────────────────────────────── */

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function shot(made: number | null, attempted: number | null): string {
  if (made == null && attempted == null) return '—';
  return `${made ?? 0}-${attempted ?? 0}`;
}

function signed(value: number | null): string {
  if (value == null) return '—';
  const n = Math.round(value);
  return n > 0 ? `+${n}` : `${n}`;
}

function count(value: number | null): string {
  return value == null ? '—' : String(value);
}

/** The NBA feed reports a live clock as an ISO duration ("PT05M30.00S"). */
function clockLabel(iso: string): string {
  const m = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso ?? '');
  if (!m) return '';
  return `${Number(m[1] ?? 0)}:${String(Math.round(Number(m[2] ?? 0))).padStart(2, '0')}`;
}

function periodLabel(period: number, type: string): string {
  if (type === 'OVERTIME' || period > 4) return `OT${Math.max(1, period - 4)}`;
  return `Q${period}`;
}

/** A player who never checked in — the feed still lists the whole roster. */
function isDnp(p: BoxScorePlayer): boolean {
  return !p.minutes || p.minutes === '0:00';
}

/* ── Colours ────────────────────────────────────────────── */

type BarColors = ColorPair;

/* ── Status ─────────────────────────────────────────────── */

function StatusPill({ data }: { data: BoxScore }) {
  if (data.status === 2) {
    const clock = clockLabel(data.gameClock);
    return (
      <span className="flex items-center gap-2 rounded-full bg-brand-red px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        Live
        <span className="font-semibold normal-case tracking-normal text-white/90">
          {periodLabel(data.period, '')}
          {clock ? ` · ${clock}` : ''}
        </span>
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
      {data.statusText || 'Final'}
    </span>
  );
}

/* ── Line score ─────────────────────────────────────────── */

function LineScore({ away, home }: { away: BoxScoreSide; home: BoxScoreSide }) {
  const columns = Math.max(away.periods.length, home.periods.length);
  const cell = 'px-1.5 py-1.5 text-right tabular-nums';

  const row = (side: BoxScoreSide) => (
    <tr className="border-t border-brand-line">
      <th scope="row" className="w-14 py-1.5 pr-2 text-left">
        <span className="font-heading text-sm font-black uppercase tracking-wide text-brand-ink">
          {side.tricode}
        </span>
      </th>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className={`${cell} text-stone-600`}>
          {side.periods[i]?.score ?? '—'}
        </td>
      ))}
      <td className={`${cell} font-heading text-base font-black text-brand-ink`}>
        {side.score ?? '—'}
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-md table-fixed text-sm">
        <thead>
          <tr className="text-xs font-bold uppercase tracking-widest text-stone-500">
            <th scope="col" className="w-14 py-1 pr-2 text-left font-bold">
              &nbsp;
            </th>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} scope="col" className="px-1.5 py-1 text-right font-bold">
                {periodLabel(
                  (away.periods[i] ?? home.periods[i])?.period ?? i + 1,
                  (away.periods[i] ?? home.periods[i])?.periodType ?? 'REGULAR',
                )}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-1 text-right font-bold text-stone-500">
              T
            </th>
          </tr>
        </thead>
        <tbody>
          {row(away)}
          {row(home)}
        </tbody>
      </table>
    </div>
  );
}

/* ── Team stats comparison ──────────────────────────────── */

interface StatLine {
  label: string;
  away: number | null;
  home: number | null;
  format: (v: number | null) => string;
  /** Turnovers and fouls read better when fewer — invert who gets the bold. */
  lowerIsBetter?: boolean;
}

function StatCompareRow({ line, colors }: { line: StatLine; colors: BarColors }) {
  const a = line.away ?? 0;
  const h = line.home ?? 0;
  const total = a + h;
  const awayShare = total > 0 ? (a / total) * 100 : 50;
  const leader = a === h ? null : (line.lowerIsBetter ? a < h : a > h) ? 'away' : 'home';

  return (
    <div className="py-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span
          className={`text-right text-sm tabular-nums ${
            leader === 'away' ? 'font-bold text-brand-ink' : 'text-stone-500'
          }`}
        >
          {line.format(line.away)}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-stone-500">
          {line.label}
        </span>
        <span
          className={`text-left text-sm tabular-nums ${
            leader === 'home' ? 'font-bold text-brand-ink' : 'text-stone-500'
          }`}
        >
          {line.format(line.home)}
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
        <span
          className="border-r-2 border-white"
          style={{ width: `${awayShare}%`, backgroundColor: colors.away }}
        />
        <span style={{ width: `${100 - awayShare}%`, backgroundColor: colors.home }} />
      </div>
    </div>
  );
}

function TeamStats({
  away,
  home,
  colors,
}: {
  away: BoxScoreSide;
  home: BoxScoreSide;
  colors: BarColors;
}) {
  const a = away.stats;
  const h = home.stats;
  const lines: StatLine[] = [
    { label: 'Field Goal %', away: a.fgPct, home: h.fgPct, format: pct },
    { label: '3-Point %', away: a.fg3Pct, home: h.fg3Pct, format: pct },
    { label: 'Free Throw %', away: a.ftPct, home: h.ftPct, format: pct },
    { label: 'Rebounds', away: a.reb, home: h.reb, format: count },
    { label: 'Assists', away: a.ast, home: h.ast, format: count },
    { label: 'Steals', away: a.stl, home: h.stl, format: count },
    { label: 'Blocks', away: a.blk, home: h.blk, format: count },
    { label: 'Turnovers', away: a.tov, home: h.tov, format: count, lowerIsBetter: true },
    { label: 'Fouls', away: a.pf, home: h.pf, format: count, lowerIsBetter: true },
  ];

  return (
    <div>
      {/* Names each bar segment, so a close pair of primaries is still readable. */}
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.away }} />
          {away.tricode}
        </span>
        <span className="flex items-center gap-1.5">
          {home.tricode}
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.home }} />
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {lines.map((line) => (
          <StatCompareRow key={line.label} line={line} colors={colors} />
        ))}
      </div>
    </div>
  );
}

/* ── Per-player table ───────────────────────────────────── */

const COLUMNS: { key: string; label: string }[] = [
  { key: 'min', label: 'Min' },
  { key: 'pts', label: 'Pts' },
  { key: 'reb', label: 'Reb' },
  { key: 'ast', label: 'Ast' },
  { key: 'stl', label: 'Stl' },
  { key: 'blk', label: 'Blk' },
  { key: 'tov', label: 'TO' },
  { key: 'pf', label: 'PF' },
  { key: 'pm', label: '+/-' },
  { key: 'fg', label: 'FG' },
  { key: 'fg3', label: '3PT' },
  { key: 'ft', label: 'FT' },
];

function PlayerRow({ player }: { player: BoxScorePlayer }) {
  const dnp = isDnp(player);
  const num = 'px-2 py-2 text-right text-sm tabular-nums';

  // A player who never checked in has no line at all, so every stat reads as an
  // em dash rather than a row of zeros.
  //
  // Emphasis is weight + colour only, not the display font: Oswald's digits have
  // a taller cap and sit lower in the line box than Poppins', so mixing the two
  // leaves the points column visibly off-centre against its neighbours.
  const statCell = (value: string, emphasis = false) => (
    <td
      className={`${num} ${
        dnp ? 'text-stone-500' : emphasis ? 'font-bold text-brand-navy' : 'text-stone-600'
      }`}
    >
      {dnp ? '—' : value}
    </td>
  );

  const shotCell = (made: number | null, attempted: number | null, percentage: number | null) => (
    <td className={num}>
      <div className={dnp ? 'text-stone-500' : 'text-brand-ink'}>
        {dnp ? '—' : shot(made, attempted)}
      </div>
      {/* The second line stays even for a DNP so every row is the same height. */}
      <div className="text-xs text-stone-500">{dnp ? '\u00A0' : pct(percentage)}</div>
    </td>
  );

  return (
    <tr className="border-t border-brand-line transition hover:bg-stone-50">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        <span className="text-sm font-semibold text-brand-ink">{player.name}</span>
        {(player.jersey || player.position) && (
          <span className="ml-2 text-xs font-bold uppercase tracking-widest text-stone-500">
            {[player.jersey ? `#${player.jersey}` : null, player.position]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </th>
      <td className={`${num} text-stone-600`}>{dnp ? 'DNP' : player.minutes}</td>
      {statCell(count(player.pts), true)}
      {statCell(count(player.reb))}
      {statCell(count(player.ast))}
      {statCell(count(player.stl))}
      {statCell(count(player.blk))}
      {statCell(count(player.tov))}
      {statCell(count(player.pf))}
      {statCell(signed(player.plusMinus))}
      {shotCell(player.fgMade, player.fgAttempted, player.fgPct)}
      {shotCell(player.fg3Made, player.fg3Attempted, player.fg3Pct)}
      {shotCell(player.ftMade, player.ftAttempted, player.ftPct)}
    </tr>
  );
}

function TotalRow({ side }: { side: BoxScoreSide }) {
  const s = side.stats;
  const num = 'px-2 py-2 text-right text-sm tabular-nums';

  const shotTotal = (made: number | null, attempted: number | null, percentage: number | null) => (
    <td className={num}>
      <div className="font-semibold text-brand-ink">{shot(made, attempted)}</div>
      <div className="text-xs font-normal text-stone-500">{pct(percentage)}</div>
    </td>
  );

  return (
    <tr className="border-t-2 border-brand-line bg-stone-50">
      <th scope="row" className="py-2 pr-3 text-left">
        <span className="font-heading text-sm font-black uppercase tracking-wide text-brand-ink">
          Total
        </span>
      </th>
      <td className={`${num} font-semibold text-stone-600`}>{s.minutes ?? '—'}</td>
      <td className={`${num} font-bold text-brand-navy`}>{count(s.pts)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.reb)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.ast)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.stl)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.blk)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.tov)}</td>
      <td className={`${num} font-semibold text-stone-600`}>{count(s.pf)}</td>
      <td className={`${num} font-semibold text-stone-500`}>{signed(s.plusMinus)}</td>
      {shotTotal(s.fgMade, s.fgAttempted, s.fgPct)}
      {shotTotal(s.fg3Made, s.fg3Attempted, s.fg3Pct)}
      {shotTotal(s.ftMade, s.ftAttempted, s.ftPct)}
    </tr>
  );
}

function PlayerTable({ side, status }: { side: BoxScoreSide; status: number }) {
  const starters = side.players.filter((p) => p.starter === true);
  const bench = side.players.filter((p) => p.starter !== true);

  // Live games keep the feed's order (starters as listed, then the bench as
  // listed). Once a game is final the box score reads by scoring instead.
  const inOrder = (list: BoxScorePlayer[]) =>
    status === 2 ? list : [...list].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));

  const showDivider = starters.length > 0 && bench.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-brand-line text-xs font-bold uppercase tracking-widest text-stone-500">
            <th scope="col" className="py-1.5 pr-3 text-left font-bold">
              Player
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-1.5 text-right font-bold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inOrder(starters).map((p) => (
            <PlayerRow key={p.playerId} player={p} />
          ))}

          {showDivider && (
            <tr>
              <td
                colSpan={COLUMNS.length + 1}
                className="border-t-2 border-brand-line pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-stone-500"
              >
                Bench
              </td>
            </tr>
          )}

          {inOrder(bench).map((p) => (
            <PlayerRow key={p.playerId} player={p} />
          ))}

          <TotalRow side={side} />
        </tbody>
      </table>
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────── */

function TeamTab({
  side,
  color,
  active,
  onClick,
}: {
  side: BoxScoreSide;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 px-3.5 py-2 font-heading text-sm font-black uppercase tracking-wide transition ${
        active ? 'bg-brand-navyDark text-white' : 'bg-white text-stone-500 hover:bg-stone-100'
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {side.tricode}
      <span
        className={`text-xs font-semibold tabular-nums ${active ? 'text-white/70' : 'text-stone-500'}`}
      >
        {side.score ?? '—'}
      </span>
    </button>
  );
}

export function BoxScorePanel({
  data,
  awayColor = '#2B2B2B',
  homeColor = '#1C4188',
}: {
  data: BoxScore;
  awayColor?: string;
  homeColor?: string;
}) {
  const [active, setActive] = useState<'away' | 'home'>('away');
  const colors = distinctPair(awayColor, homeColor);
  const side = active === 'away' ? data.away : data.home;

  return (
    <section className="flex flex-col rounded-lg border border-brand-line bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-3">
        <h2 className="font-heading text-2xl font-semibold uppercase tracking-wide text-brand-ink">
          Box Score
        </h2>
        <StatusPill data={data} />
      </div>

      <div className="flex flex-col gap-6 px-5 py-4">
        <LineScore away={data.away} home={data.home} />

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-stone-500">
            Team Stats
          </p>
          <TeamStats away={data.away} home={data.home} colors={colors} />
        </div>

        <div className="flex flex-col gap-3">
          <div
            role="tablist"
            aria-label="Team box score"
            className="flex w-full overflow-hidden rounded-lg border border-brand-line"
          >
            <TeamTab
              side={data.away}
              color={colors.away}
              active={active === 'away'}
              onClick={() => setActive('away')}
            />
            <TeamTab
              side={data.home}
              color={colors.home}
              active={active === 'home'}
              onClick={() => setActive('home')}
            />
          </div>
          <div role="tabpanel" aria-label={`${side.tricode} box score`}>
            <PlayerTable side={side} status={data.status} />
          </div>
        </div>
      </div>
    </section>
  );
}
