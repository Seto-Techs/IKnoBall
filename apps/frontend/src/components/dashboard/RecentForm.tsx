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
    <Panel title="Recent Form" className="overflow-hidden" contentClassName="!p-0">
      {loading ? (
        <LoadingSpinner />
      ) : lastGames.length > 0 ? (
        <div
          className={`flex overflow-hidden ${hasAnyColor ? 'divide-x divide-white/10' : 'divide-x divide-brand-line'} max-md:flex-col max-md:divide-x-0 max-md:divide-y`}
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
              <div
                key={i}
                style={
                  bg
                    ? { backgroundColor: bg, animationDelay: `${i * 70}ms` }
                    : ({ animationDelay: `${i * 70}ms` } as React.CSSProperties)
                }
                className={`group/cell relative isolate flex flex-1 flex-col items-center gap-2 overflow-hidden px-3 py-5 text-center transition-[filter,transform] duration-300 will-change-transform hover:brightness-[1.03] cal-cell-in ${!bg ? 'bg-white hover:bg-stone-50' : `ring-1 ring-inset ${pillRing}`}`}
              >
                {/* subtle radial mesh for depth */}
                {bg && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-[0.11]"
                      style={{
                        background: `radial-gradient(420px circle at 70% 0%, ${isBright ? '#000' : '#fff'} 0%, transparent 58%)`,
                      }}
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] opacity-[0.13] bg-gradient-to-t from-black to-transparent"
                      style={{ opacity: isBright ? 0.06 : 0.16 }}
                    />
                    {/* watermark abbr */}
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 select-none font-heading text-[52px] font-black leading-none tracking-tighter ${isBright ? 'text-brand-ink/[0.06]' : 'text-white/[0.07]'}`}
                    >
                      {opp?.abbreviation ?? game.opponentAbbr}
                    </span>
                    {/* inner highlight */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-none shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                    />
                  </>
                )}

                <span
                  className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tracking-wide ring-1 transition-transform duration-300 group-hover/cell:scale-105 ${
                    won
                      ? 'bg-emerald-500 text-white ring-emerald-600/20 shadow-[0_2px_10px_rgba(16,185,129,0.35)]'
                      : 'bg-red-500 text-white ring-red-600/20 shadow-[0_2px_10px_rgba(239,68,68,0.30)]'
                  } ${bg ? 'shadow-[0_2px_10px_rgba(0,0,0,0.22)]' : ''}`}
                >
                  {won ? 'W' : 'L'}
                </span>
                {opp?.logoUrl ? (
                  <img
                    src={opp.logoUrl}
                    alt=""
                    aria-hidden="true"
                    className="relative z-10 h-12 w-12 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover/cell:scale-[1.06] group-hover/cell:drop-shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
                  />
                ) : (
                  <span
                    className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${isBright ? 'bg-brand-ink/10 text-brand-ink' : 'bg-white/15 text-white'}`}
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
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No recent games yet." />
      )}
    </Panel>
  );
}
