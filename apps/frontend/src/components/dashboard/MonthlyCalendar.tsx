import { useState } from 'react';
import type { Game, TeamWithLeaders } from '../../lib/api';
import { useTeamSchedule } from '../../lib/api';
import { hexLuminance, LoadingSpinner, Panel } from './shared';
import { GameDetailsPopup } from './GameDetailsPopup';
// Current season only: 2026-27 runs October 2026 – April 2027.
const SEASON_FIRST = { year: 2026, month: 9 };
const SEASON_LAST = { year: 2027, month: 3 };

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function initialMonth(): { year: number; month: number } {
  const now = new Date();
  if (
    now.getFullYear() < SEASON_FIRST.year ||
    (now.getFullYear() === SEASON_FIRST.year && now.getMonth() < SEASON_FIRST.month)
  ) {
    return SEASON_FIRST;
  }
  if (
    now.getFullYear() > SEASON_LAST.year ||
    (now.getFullYear() === SEASON_LAST.year && now.getMonth() > SEASON_LAST.month)
  ) {
    return SEASON_LAST;
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function monthKey({ year, month }: { year: number; month: number }): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function opponentOf(game: Game, team: TeamWithLeaders, teams?: TeamWithLeaders[] | null) {
  const isHome = game.homeTeam === team.fullName || game.homeTeam === team.teamName;
  const oppName = isHome ? game.awayTeam : game.homeTeam;
  const opp = (teams ?? []).find(
    (t) => t.fullName === oppName || t.teamName === oppName || t.abbreviation === oppName,
  );
  return { isHome, oppName, opp };
}

function GameBlock({
  game,
  team,
  teams,
}: {
  game: Game;
  team: TeamWithLeaders;
  teams?: TeamWithLeaders[] | null;
}) {
  const { isHome, oppName, opp } = opponentOf(game, team, teams);
  const bg = opp?.primaryColor;
  const isBright = bg ? hexLuminance(bg) > 0.45 : false;
  const pillTx = isBright ? 'text-brand-ink' : 'text-white';
  const pillBg = isBright ? 'bg-brand-ink/15' : 'bg-white/25';
  const ring = isBright ? 'ring-brand-ink/10' : 'ring-white/25';
  const abbr = opp?.abbreviation ?? oppName.slice(0, 3).toUpperCase();

  return (
    <div
      className={`relative isolate flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden py-1 ${
        !bg ? 'bg-stone-100' : ''
      } ${bg ? `ring-1 ring-inset ${ring}` : ''}`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
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
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-black to-transparent"
            style={{ opacity: isBright ? 0.06 : 0.16 }}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 select-none font-heading text-[34px] font-black leading-none tracking-tighter ${isBright ? 'text-brand-ink/[0.06]' : 'text-white/[0.07]'}`}
          >
            {abbr}
          </span>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
          />
        </>
      )}
      {opp?.logoUrl ? (
        <img
          src={opp.logoUrl}
          alt=""
          aria-hidden="true"
          className="relative z-10 h-[60%] aspect-square w-auto object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
        />
      ) : (
        <span className={`relative z-10 text-base font-extrabold ${pillTx}`}>{abbr}</span>
      )}
      <span
        className={`relative z-10 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-widest ring-1 ring-inset ${ring} ${pillBg} ${pillTx}`}
      >
        {isHome ? 'vs' : '@'}
      </span>
    </div>
  );
}

export function MonthlyCalendar({
  abbr,
  team,
  teams,
}: {
  abbr: string;
  team: TeamWithLeaders;
  teams?: TeamWithLeaders[] | null;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const { data: games, isLoading } = useTeamSchedule(abbr, monthKey(month));

  const canPrev = month.year > SEASON_FIRST.year || month.month > SEASON_FIRST.month;
  const canNext = month.year < SEASON_LAST.year || month.month < SEASON_LAST.month;

  const prev = () => {
    setSelectedGame(null);
    setMonth((m) =>
      m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 },
    );
  };
  const next = () => {
    setSelectedGame(null);
    setMonth((m) =>
      m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 },
    );
  };

  const byDay = new Map<string, Game[]>();
  for (const g of games ?? []) {
    const d = new Date(g.gameDateTime);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = byDay.get(key);
    if (list) list.push(g);
    else byDay.set(key, [g]);
  }

  const firstDay = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const lead = firstDay.getDay();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const today = new Date();

  return (
    <Panel title="Schedule">
      <div className="flex items-center justify-between bg-brand-navyDark px-5 py-3">
        <button
          type="button"
          onClick={prev}
          disabled={!canPrev}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-white/10 active:scale-90 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ‹
        </button>
        <span className="font-heading text-2xl font-extrabold uppercase tracking-wide text-white">
          {new Date(month.year, month.month, 1).toLocaleString('en-US', { month: 'long' })}{' '}
          <span className="text-brand-gold">{month.year}</span>
        </span>
        <button
          type="button"
          onClick={next}
          disabled={!canNext}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-white/10 active:scale-90 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-7 bg-brand-navyDark">
            {WEEKDAY_HEADERS.map((label) => (
              <div
                key={label}
                className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/80"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-t border-l border-brand-line">
            {Array.from({ length: totalCells }, (_, i) => {
              const d = new Date(month.year, month.month, i - lead + 1);
              const delay = { animationDelay: `${Math.min(i * 8, 240)}ms` };
              if (d.getMonth() !== month.month) {
                return (
                  <div
                    key={i}
                    style={{ ...delay, backgroundColor: team.primaryColor }}
                    className="cal-cell-in aspect-[3/2] border-b border-r border-brand-line"
                  />
                );
              }
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const dayGames = byDay.get(key) ?? [];
              const isToday =
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate();
              const cellBg =
                dayGames.length === 1
                  ? opponentOf(dayGames[0], team, teams).opp?.primaryColor
                  : null;
              const cellTx = cellBg
                ? hexLuminance(cellBg) > 0.45
                  ? 'text-brand-ink'
                  : 'text-white'
                : 'text-stone-400';
              const hasGame = dayGames.length > 0;
              const isSingle = dayGames.length === 1;
              const singleGame = isSingle ? dayGames[0] : null;
              const dateLabel = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              if (!hasGame) {
                return (
                  <div
                    key={i}
                    style={delay}
                    className={`cal-cell-in group relative flex aspect-[3/2] flex-col overflow-hidden border-b border-r border-brand-line ${
                      isToday ? 'ring-2 ring-brand-gold ring-inset' : ''
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`absolute left-1.5 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isToday ? 'bg-brand-navy text-white' : 'text-stone-400'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex-1 bg-stone-50/60" />
                  </div>
                );
              }
              if (isSingle && singleGame) {
                const { oppName } = opponentOf(singleGame, team, teams);
                const aria = `${oppName} on ${dateLabel} — ${singleGame.status || 'Scheduled'}`;
                return (
                  <button
                    key={i}
                    type="button"
                    style={delay}
                    onClick={() => setSelectedGame(singleGame)}
                    aria-label={aria}
                    className={`cal-cell-in group relative flex aspect-[3/2] flex-col overflow-hidden border-b border-r border-brand-line text-left transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset ${
                      isToday ? 'ring-2 ring-brand-gold ring-inset' : ''
                    } ${hasGame ? 'cursor-pointer' : ''}`}
                  >
                    <span
                      className={`pointer-events-none absolute left-1.5 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isToday ? 'bg-brand-navy text-white' : cellTx
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col">
                      <GameBlock game={singleGame} team={team} teams={teams} />
                    </div>
                  </button>
                );
              }
              // defensive: 2 games in one day (team-centric should not happen)
              return (
                <div
                  key={i}
                  style={delay}
                  className={`cal-cell-in group relative flex aspect-[3/2] flex-col overflow-hidden border-b border-r border-brand-line ${
                    isToday ? 'ring-2 ring-brand-gold ring-inset' : ''
                  }`}
                >
                  <span
                    className={`absolute left-1.5 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      isToday ? 'bg-brand-navy text-white' : 'text-stone-400'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex min-h-0 flex-1 flex-row divide-x divide-black/10">
                    {dayGames.map((g) => {
                      const { oppName } = opponentOf(g, team, teams);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGame(g)}
                          aria-label={`${oppName} on ${dateLabel}`}
                          className="flex min-h-0 min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
                        >
                          <GameBlock game={g} team={team} teams={teams} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <GameDetailsPopup
        game={selectedGame}
        team={team}
        teams={teams}
        open={!!selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </Panel>
  );
}
