import type { TeamRecord, TeamWithLeaders } from '../../lib/api';
import { formatGameDate, hexLuminance } from './shared';

export function HeroBanner({
  team,
  record,
  nextGame,
  onChooseTeam,
  teams,
}: {
  team: TeamWithLeaders;
  record?: TeamRecord | null;
  nextGame?: { homeTeam: string; awayTeam: string; gameDateTime: string } | null;
  onChooseTeam: () => void;
  teams?: TeamWithLeaders[] | null;
}) {
  const opponentName = nextGame
    ? nextGame.homeTeam === team.fullName || nextGame.homeTeam === team.teamName
      ? nextGame.awayTeam
      : nextGame.homeTeam
    : null;
  const opponent = opponentName
    ? (teams ?? []).find((t) => t.fullName === opponentName || t.teamName === opponentName)
    : undefined;
  const isBright = hexLuminance(team.primaryColor) > 0.45;
  const tx = isBright ? 'text-brand-ink' : 'text-white';
  const txMuted = isBright ? 'text-brand-ink/75' : 'text-white/80';
  const txHint = isBright ? 'text-brand-ink/60' : 'text-white/65';
  const rule = isBright ? 'bg-brand-ink/15' : 'bg-white/15';

  // Logo sits between the city/region line and the team name. Split on
  // teamName (fullName minus the trailing teamName), not word count —
  // "Portland Trail Blazers" renders Portland · logo · Trail Blazers
  // without special-casing. Verified: every fullName ends with teamName.
  const bottomLine = team.teamName;
  const topLine = team.fullName.slice(0, -bottomLine.length).trim();

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-brand-line"
      style={{ backgroundColor: team.primaryColor }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 23px, white 23px, white 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, white 23px, white 24px)',
        }}
      />
      <img
        src={team.logoUrl}
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-16 h-80 w-80 object-contain opacity-[0.06] ${isBright ? 'invert' : ''}`}
      />

      <div className="relative z-10">
        {/* ── Row 1: Team identity — horizontal ── */}
        <div className="flex items-center justify-center gap-8 px-8 pt-7 pb-5">
          <p
            className={`shrink-0 font-heading text-7xl font-semibold uppercase tracking-wide ${tx}`}
          >
            {topLine}
          </p>
          <img
            src={team.logoUrl}
            alt={`${team.fullName} logo`}
            className="h-auto max-h-32 w-auto max-w-32 shrink object-contain"
          />
          <h1
            className={`shrink-0 font-heading text-7xl font-semibold uppercase tracking-wide ${tx}`}
          >
            {bottomLine}
          </h1>
        </div>

        {/* ── Row 2: Stats | Last 5 | Upcoming | CTA ── */}
        <div className={`flex items-center justify-between gap-6 border-t px-8 py-4 ${rule}`}>
          <div className="flex items-center gap-5">
            <>
              <span className={`text-sm font-semibold ${txMuted}`}>
                {team.conference === 'East' ? 'Eastern' : 'Western'} · {team.division}
              </span>
              <div aria-hidden="true" className={`h-7 w-px shrink-0 ${rule}`} />
            </>
            <div className="text-center">
              <p className={`font-heading text-4xl font-semibold leading-none tabular-nums ${tx}`}>
                {record ? `${record.wins}-${record.losses}` : '—'}
              </p>
              <p className={`mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] ${txHint}`}>
                Record
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-6">
            <div className="flex items-center gap-3">
              {opponent?.logoUrl && (
                <img
                  src={opponent.logoUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-14 w-14 shrink-0 object-contain"
                />
              )}
              <div className="min-w-0">
                <p className={`truncate font-heading text-xl font-semibold uppercase ${tx}`}>
                  {opponent?.abbreviation ?? opponentName ?? '—'}
                </p>
                {nextGame && (
                  <p className={`mt-0.5 text-sm ${txMuted}`}>
                    {formatGameDate(nextGame.gameDateTime, 'EEE, MMM d')} · Upcoming
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onChooseTeam}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${isBright ? 'border-brand-ink/20 text-brand-ink/70 hover:border-brand-ink/40 hover:bg-brand-ink/5' : 'border-white/20 text-white/70 hover:border-white/40 hover:bg-white/10'}`}
            >
              Change Team
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
