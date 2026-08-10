import type { TeamWithLeaders } from '../../lib/api';
import { formatGameDate, Panel, LoadingSpinner, EmptyState } from './shared';

function TeamCell({ name, teams }: { name: string; teams?: TeamWithLeaders[] | null }) {
  const team = (teams ?? []).find((t) => t.fullName === name || t.teamName === name);
  return (
    <span className="inline-flex items-center gap-2.5">
      {team && (
        <img
          src={team.logoUrl}
          alt=""
          aria-hidden="true"
          className="h-5 w-5 shrink-0 object-contain"
        />
      )}
      <span className="font-medium text-brand-ink">{name}</span>
    </span>
  );
}

export function ScheduleTable({
  games,
  loading = false,
  teams,
}: {
  games?: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    gameDateTime: string;
    status: string;
  }[];
  loading?: boolean;
  teams?: TeamWithLeaders[] | null;
}) {
  return (
    <Panel title="Schedule">
      {loading ? (
        <LoadingSpinner />
      ) : games && games.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-brand-line text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                <th scope="col" className="px-5 py-3">
                  Date
                </th>
                <th scope="col" className="px-5 py-3">
                  Away
                </th>
                <th scope="col" className="px-5 py-3">
                  Score
                </th>
                <th scope="col" className="px-5 py-3">
                  Home
                </th>
                <th scope="col" className="px-5 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {games.map((game) => {
                const isLive = game.status.toLowerCase() === 'live';
                return (
                  <tr key={game.id} className="text-base transition-colors hover:bg-stone-50">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-stone-600">
                      {formatGameDate(game.gameDateTime, 'EEE, MMM d · h:mm a')}
                    </td>
                    <td className="px-5 py-3">
                      <TeamCell name={game.awayTeam} teams={teams} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-stone-600">
                      {game.homeScore !== null && game.awayScore !== null
                        ? `${game.awayScore} – ${game.homeScore}`
                        : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <TeamCell name={game.homeTeam} teams={teams} />
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded px-2.5 py-1 text-sm font-medium ${
                          isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {game.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Run the worker to sync NBA schedule data." />
      )}
    </Panel>
  );
}
