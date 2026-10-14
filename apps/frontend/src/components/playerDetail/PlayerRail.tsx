import { Link } from '@tanstack/react-router';
import { Clock, MapPin } from 'lucide-react';
import type { PlayerNextGame, PlayerTeamRef } from '../../lib/api';
import { formatGameDate, formatTimeET } from '../../lib/game-utils';
import { Panel } from '../dashboard/shared';

/**
 * The player's next tip-off, from their side: the opponent and whether the game
 * is home. The whole card opens the game detail page.
 */
export function NextGamePanel({ game }: { game: PlayerNextGame | null }) {
  return (
    <Panel title="Next Game">
      {!game ? (
        <p className="px-5 py-4 text-sm text-stone-400">No upcoming game scheduled.</p>
      ) : (
        <Link
          to="/game/$gameId"
          params={{ gameId: game.id }}
          className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy"
        >
          <div className="flex items-center gap-3">
            {game.opponentLogoUrl ? (
              <img
                src={game.opponentLogoUrl}
                alt=""
                className="h-12 w-12 shrink-0 object-contain"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                {game.isHome ? 'vs' : '@'} {game.opponentTricode ?? 'TBD'}
              </p>
              <p className="truncate font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
                {game.opponentName}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs font-semibold text-stone-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatGameDate(game.gameDateTime, 'EEE, MMM d')} · {formatTimeET(game.gameDateTime)}{' '}
              ET
            </span>
            {game.arenaName ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {[game.arenaName, game.arenaCity].filter(Boolean).join(' • ')}
              </span>
            ) : null}
          </div>
        </Link>
      )}
    </Panel>
  );
}

/** The club the player is on file for, with the arena and coach that go with it. */
export function TeamInfoPanel({ team }: { team: PlayerTeamRef | null }) {
  return (
    <Panel title="Team">
      {!team ? (
        <p className="px-5 py-4 text-sm text-stone-400">Not on an active roster.</p>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 px-5 py-4">
            {team.logoUrl ? (
              <img
                src={team.logoUrl}
                alt=""
                className="h-12 w-12 shrink-0 object-contain"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-black uppercase tracking-wide text-brand-ink">
                {team.fullName}
              </p>
              <p className="text-xs font-semibold text-stone-500">
                {team.conference === 'East' ? 'Eastern' : 'Western'} · {team.division}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px border-t border-brand-line bg-brand-line">
            <div className="bg-white px-5 py-3">
              <dt className="text-xs font-bold uppercase tracking-widest text-stone-500">Arena</dt>
              <dd className="truncate text-sm font-semibold text-brand-ink">{team.arena || '—'}</dd>
            </div>
            <div className="bg-white px-5 py-3">
              <dt className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Head Coach
              </dt>
              <dd className="truncate text-sm font-semibold text-brand-ink">
                {team.headCoach || '—'}
              </dd>
            </div>
          </dl>

          <div
            className="h-1.5 w-full"
            style={{ backgroundColor: team.primaryColor || '#1C4188' }}
          />
        </div>
      )}
    </Panel>
  );
}
