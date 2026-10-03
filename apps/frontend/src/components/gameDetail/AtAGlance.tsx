import { Link } from '@tanstack/react-router';
import { Panel } from '../dashboard/shared';
import { useHeadToHead, type SeriesTeam } from '../../lib/api';
import { formatDateOnly } from '../../lib/game-utils';

function SeriesSide({
  team,
  leading,
  align = 'left',
}: {
  team: SeriesTeam;
  leading: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
        {team.tricode}
      </span>
      <span
        className={`font-heading text-2xl font-black leading-none ${
          leading ? 'text-brand-ink' : 'text-stone-300'
        }`}
      >
        {team.wins}
      </span>
    </div>
  );
}

/**
 * Prior-season regular-season series between the two teams in this game. The
 * record leads; each meeting links through to its own game detail page.
 */
export function AtAGlance({ gameId }: { gameId: string }) {
  const { data, isLoading } = useHeadToHead(gameId);

  if (isLoading) {
    return (
      <Panel title="At a Glance">
        <p className="px-5 py-4 text-sm text-stone-400">Loading season series…</p>
      </Panel>
    );
  }

  if (!data || data.meetings.length === 0) {
    return (
      <Panel title="At a Glance">
        <p className="px-5 py-4 text-sm text-stone-400">No regular-season meetings last season.</p>
      </Panel>
    );
  }

  const { away, home, season, meetings } = data;

  return (
    <Panel title="At a Glance">
      <div className="flex flex-col px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {season} regular season · {meetings.length}{' '}
          {meetings.length === 1 ? 'meeting' : 'meetings'}
        </p>

        <div className="mt-3 flex items-center justify-between gap-4">
          <SeriesSide team={away} leading={away.wins > home.wins} />
          <span className="font-heading text-xs font-black uppercase tracking-widest text-stone-400">
            Series
          </span>
          <SeriesSide team={home} leading={home.wins > away.wins} align="right" />
        </div>

        <ul className="mt-4 divide-y divide-brand-line border-t border-brand-line">
          {meetings.map((m) => {
            const awayWon = (m.awayScore ?? 0) > (m.homeScore ?? 0);
            return (
              <li key={m.id}>
                <Link
                  to="/game/$gameId"
                  params={{ gameId: m.id }}
                  className="flex items-center gap-3 py-2 text-sm transition hover:opacity-70"
                >
                  <span className="w-24 shrink-0 text-xs text-stone-400">
                    {formatDateOnly(m.gameDate, 'MMM d, yyyy')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-brand-ink">
                    <span className={awayWon ? 'font-black' : 'text-stone-500'}>
                      {m.awayTricode} {m.awayScore}
                    </span>
                    <span className="mx-1.5 text-stone-300">–</span>
                    <span className={awayWon ? 'text-stone-500' : 'font-black'}>
                      {m.homeScore} {m.homeTricode}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
