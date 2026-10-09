import { Link } from '@tanstack/react-router';
import type { TeamRecord, TeamWithLeaders } from '../../lib/api';
import { darken, isLightColor } from '../../lib/color';
import { EmptyState, formatGameDate, hexLuminance, LoadingSpinner, Panel } from './shared';

export function RecentForm({
  record,
  loading = false,
  teams,
}: {
  record?: TeamRecord | null;
  loading?: boolean;
  teams?: TeamWithLeaders[] | null;
}) {
  const teamByAbbr: Record<string, TeamWithLeaders> = Object.fromEntries(
    (teams ?? []).map((t) => [t.abbreviation, t]),
  );
  const lastGames = record?.lastGames ?? [];
  const hasAnyColor = lastGames.some((g) => Boolean(teamByAbbr[g.opponentAbbr]?.primaryColor));

  return (
    <Panel title="Recent Form" clip contentClassName="!p-0">
      {loading ? (
        <LoadingSpinner />
      ) : lastGames.length > 0 ? (
        <div
          className={`flex flex-col divide-y divide-brand-line overflow-hidden md:flex-row md:divide-x md:divide-y-0 ${
            hasAnyColor ? 'md:divide-white/10' : ''
          }`}
        >
          {lastGames.map((game, i) => {
            const opp = teamByAbbr[game.opponentAbbr];
            const won = game.ourScore > game.oppScore;
            const rawBg = opp?.primaryColor || null;
            // SAS #C4CED4 lum 0.606 outlier vs peers median 0.081, max 0.192.
            // 0.42 → #72777B lum 0.182 matches brightest peer #E03A3E 0.192 — same
            // perceived brightness, passes white-on-bg contrast (4.5:1).
            const bg = rawBg && isLightColor(rawBg) ? darken(rawBg, 0.42) : rawBg;
            const isBright = bg ? hexLuminance(bg) > 0.42 : false;
            // text tokens based on (possibly darkened) bg luminance
            const tx = bg ? (isBright ? 'text-brand-ink' : 'text-white') : 'text-brand-ink';
            const txScore = bg ? (isBright ? 'text-stone-700' : 'text-white/90') : 'text-stone-600';
            const pillRing = isBright ? 'ring-brand-ink/10' : 'ring-white/18';

            return (
              <Link
                key={i}
                to="/game/$gameId"
                params={{ gameId: game.gameId }}
                style={
                  bg
                    ? { backgroundColor: bg, animationDelay: `${i * 70}ms` }
                    : ({ animationDelay: `${i * 70}ms` } as React.CSSProperties)
                }
                className={`group/cell relative isolate flex flex-1 items-center gap-3 overflow-hidden px-4 py-3 text-left transition-[filter,transform] duration-300 will-change-transform hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-gold cal-cell-in md:flex-col md:items-center md:gap-2 md:px-3 md:py-5 md:text-center ${!bg ? 'bg-white hover:bg-stone-50' : `ring-1 ring-inset ${pillRing}`}`}
              >
                <span
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold tracking-wide ring-1 transition-transform duration-300 group-hover/cell:scale-105 md:h-7 md:w-7 md:text-[11px] ${
                    won
                      ? 'bg-emerald-500 text-white ring-emerald-600/20'
                      : 'bg-red-500 text-white ring-red-600/20'
                  }`}
                >
                  {won ? 'W' : 'L'}
                </span>
                {opp?.logoUrl ? (
                  <img
                    src={opp.logoUrl}
                    alt=""
                    aria-hidden="true"
                    className="relative z-10 h-8 w-8 object-contain transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover/cell:scale-[1.06] md:h-12 md:w-12"
                  />
                ) : (
                  <span
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black md:h-12 md:w-12 md:text-lg ${isBright ? 'bg-brand-ink/10 text-brand-ink' : 'bg-white/15 text-white'}`}
                  >
                    {(opp?.abbreviation ?? game.opponentAbbr).slice(0, 2)}
                  </span>
                )}
                <span className={`relative z-10 text-[13px] font-extrabold tracking-tight ${tx}`}>
                  <span
                    className={`mr-1 font-bold ${bg ? (isBright ? 'text-brand-ink/55' : 'text-white/60') : 'text-stone-400'}`}
                  >
                    {game.isHome ? 'vs' : '@'}
                  </span>
                  {opp?.abbreviation ?? game.opponentAbbr}
                </span>
                <span
                  className={`relative z-10 inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums ${txScore}`}
                >
                  <span>
                    {game.ourScore}–{game.oppScore}
                  </span>
                  <span
                    className={`h-1 w-1 rounded-full ${bg ? (isBright ? 'bg-brand-ink/20' : 'bg-white/40') : 'bg-stone-300'}`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-xs font-medium ${bg ? (isBright ? 'text-stone-500' : 'text-white/65') : 'text-stone-500'}`}
                  >
                    {formatGameDate(game.gameDate, 'MMM d')}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No recent games yet." />
      )}
    </Panel>
  );
}
