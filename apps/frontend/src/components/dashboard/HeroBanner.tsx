import { nbaTeams, type NBATeam } from '../../config/nba-teams';
import { mockLastFive } from '../../lib/mock-data';
import { formatGameDate } from './shared';
import type { SelectedTeam } from '../../lib/team';

const teamByFullName: Record<string, NBATeam> = Object.fromEntries(
  nbaTeams.map((t) => [t.fullName, t]),
);
const teamByTeamName: Record<string, NBATeam> = Object.fromEntries(
  nbaTeams.map((t) => [t.teamName, t]),
);

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function HeroBanner({
  team,
  teamInfo,
  record,
  nextGame,
  onChooseTeam,
}: {
  team: SelectedTeam;
  teamInfo?: NBATeam;
  record?: { wins: number; losses: number } | null;
  nextGame?: { homeTeam: string; awayTeam: string; gameDateTime: string } | null;
  onChooseTeam: () => void;
}) {
  const opponentName = nextGame
    ? nextGame.homeTeam === team.name || nextGame.homeTeam === teamInfo?.fullName
      ? nextGame.awayTeam
      : nextGame.homeTeam
    : null;
  const opponent = opponentName
    ? nbaTeams.find((t) => t.fullName === opponentName || t.teamName === opponentName)
    : undefined;
  const recentWins = mockLastFive.filter((g) => g.result === 'W').length;
  const recentLosses = mockLastFive.length - recentWins;
  const isBright = hexLuminance(team.primaryColor) > 0.45;
  const tx = isBright ? 'text-brand-ink' : 'text-white';
  const txMuted = isBright ? 'text-brand-ink/75' : 'text-white/80';
  const txHint = isBright ? 'text-brand-ink/60' : 'text-white/65';
  const rule = isBright ? 'bg-brand-ink/15' : 'bg-white/15';

  const nameParts = team.name.split(' ');
  const topLine = nameParts.slice(0, -1).join(' ');
  const bottomLine = nameParts[nameParts.length - 1];

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
          <p className={`shrink-0 font-heading text-7xl font-semibold uppercase tracking-wide ${tx}`}>
            {topLine}
          </p>
          <img
            src={team.logoUrl}
            alt={`${team.name} logo`}
            className="h-auto max-h-32 w-auto max-w-32 shrink object-contain"
          />
          <h1 className={`shrink-0 font-heading text-7xl font-semibold uppercase tracking-wide ${tx}`}>
            {bottomLine}
          </h1>
        </div>

        {/* ── Row 2: Stats | Last 5 | Upcoming | CTA ── */}
        <div className={`flex items-center justify-between gap-6 border-t px-8 py-4 ${rule}`}>
          <div className="flex items-center gap-5">
            {teamInfo && (
              <>
                <span className={`text-sm font-semibold ${txMuted}`}>
                  {teamInfo.conference === 'East' ? 'Eastern' : 'Western'} · {teamInfo.division}
                </span>
                <div aria-hidden="true" className={`h-7 w-px shrink-0 ${rule}`} />
              </>
            )}
            <div className="text-center">
              <p className={`font-heading text-4xl font-semibold leading-none tabular-nums ${tx}`}>
                {record ? `${record.wins}-${record.losses}` : '—'}
              </p>
              <p className={`mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] ${txHint}`}>Record</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-6">
            <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${txHint}`}>Last 5</span>
            <div className="flex gap-2.5">
              {mockLastFive.map((game, i) => {
                const opp = teamByFullName[game.opponent] ?? teamByTeamName[game.opponent];
                return (
                  <div
                    key={i}
                    className={`relative flex h-12 w-12 items-center justify-center rounded-lg ${isBright ? 'bg-brand-ink/10' : 'bg-white/10'}`}
                  >
                    {opp && (
                      <img src={opp.logoUrl} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                    )}
                    <span
                      className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${game.result === 'W' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
                    >
                      {game.result}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className={`text-sm font-semibold tabular-nums ${txMuted}`}>{recentWins}-{recentLosses}</span>
            <div aria-hidden="true" className={`h-8 w-px shrink-0 ${rule}`} />
            <div className="flex items-center gap-3">
              {opponent?.logoUrl && (
                <img src={opponent.logoUrl} alt="" aria-hidden="true" className="h-14 w-14 shrink-0 object-contain" />
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
