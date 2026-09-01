import { GiCrown, GiMedal, GiTrophyCup, GiWeightScale } from 'react-icons/gi';
import type { LeaderboardEntry } from '../../lib/mock-data';
import { Panel } from './shared';
import { darken, isLightColor } from '../../lib/color';

/* Leaderboard shows top 50, viewport shows 10 rows at a time (scroll to see rest). */
const LEADERBOARD_SIZE = 50;

function ListRow({
  rank,
  name,
  points,
  isUser,
  userColor,
}: {
  rank: number;
  name: string;
  points: number;
  isUser?: boolean;
  userColor?: string;
}) {
  const rowBg =
    isUser && userColor ? (isLightColor(userColor) ? darken(userColor, 0.35) : userColor) : '';
  const medal = !isUser
    ? rank === 1
      ? 'gold'
      : rank === 2
        ? 'silver'
        : rank === 3
          ? 'bronze'
          : null
    : null;
  const medalRowBg =
    medal === 'gold'
      ? 'bg-yellow-50'
      : medal === 'silver'
        ? 'bg-stone-50'
        : medal === 'bronze'
          ? 'bg-orange-50'
          : '';
  const medalBorder =
    medal === 'gold'
      ? 'border-l-4 border-brand-gold'
      : medal === 'silver'
        ? 'border-l-4 border-stone-400'
        : medal === 'bronze'
          ? 'border-l-4 border-amber-700'
          : '';
  const rankColor = isUser
    ? 'font-semibold text-brand-gold'
    : medal === 'gold'
      ? 'font-bold text-brand-gold'
      : medal === 'silver'
        ? 'font-bold text-stone-500'
        : medal === 'bronze'
          ? 'font-bold text-amber-700'
          : 'text-stone-500';

  return (
    <div
      className={`flex items-center gap-3 px-5 py-2 ${isUser ? 'bg-brand-navy' : medalRowBg} ${medal ? medalBorder : ''}`}
      style={rowBg ? { backgroundColor: rowBg } : undefined}
    >
      <span className={`w-7 shrink-0 text-right text-sm tabular-nums ${rankColor}`}>{rank}</span>
      {isUser ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/20"
          aria-hidden="true"
        >
          <GiCrown className="h-5 w-5 text-brand-gold" />
        </span>
      ) : medal ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            medal === 'gold'
              ? 'bg-brand-gold/20'
              : medal === 'silver'
                ? 'bg-stone-200'
                : 'bg-amber-700/15'
          }`}
          aria-hidden="true"
        >
          {medal === 'gold' ? (
            <GiTrophyCup className="h-5 w-5 text-brand-gold" />
          ) : (
            <GiMedal
              className={`h-5 w-5 ${medal === 'silver' ? 'text-stone-500' : 'text-amber-700'}`}
            />
          )}
        </span>
      ) : (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-sm font-bold text-brand-navy"
          aria-hidden="true"
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-base font-medium ${isUser ? 'text-white' : medal ? 'text-brand-ink font-semibold' : 'text-brand-ink'}`}
      >
        {name}
      </span>
      <span
        className={`w-12 shrink-0 text-right text-sm tabular-nums ${isUser ? 'text-white/85' : 'text-stone-600'}`}
      >
        {points}
      </span>
    </div>
  );
}

/**
 * Flat leaderboard — no podium columns. Ranks 1-3 use gold/silver/bronze row
 * tints (via ListRow) to differentiate. Always 10 rows: 1-10 when user is
 * inside top 10, otherwise top 9 + user row (inserted at natural rank, still
 * 10 total). Column header sticky top-0 and user row sticky top/bottom mirrors
 * StandingsSidebar conference headers.
 */
export function LeaderboardPanel({
  title,
  weighted,
  entries,
  userRank,
  userPoints,
  userName,
  userColor,
}: {
  title: string;
  weighted?: boolean;
  entries: LeaderboardEntry[];
  userRank: number;
  userPoints: number;
  userName?: string;
  userColor?: string;
}) {
  const userLabel = userName || 'You';
  const inTop50 = userRank <= LEADERBOARD_SIZE;
  const displayList: (LeaderboardEntry & { isUser?: boolean })[] = inTop50
    ? entries
        .slice(0, LEADERBOARD_SIZE)
        .map((entry) => ({ ...entry, isUser: entry.rank === userRank }))
    : [
        ...entries.slice(0, LEADERBOARD_SIZE - 1).map((entry) => ({ ...entry, isUser: false })),
        {
          rank: userRank,
          name: userLabel,
          points: userPoints,
          isUser: true,
        } as LeaderboardEntry & { isUser: boolean },
      ];
  return (
    <Panel
      title={title}
      icon={
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gold"
          aria-hidden="true"
        >
          {weighted ? (
            <GiWeightScale className="h-5 w-5 text-brand-navyDark" />
          ) : (
            <GiTrophyCup className="h-5 w-5 text-brand-navyDark" />
          )}
        </span>
      }
    >
      <div className="max-h-[480px] overflow-y-auto overscroll-contain scrollbar-hide">
        <div className="sticky top-0 z-[9] bg-white">
          <div className="flex items-center gap-3 px-5 pb-1 pt-3 text-sm font-semibold uppercase tracking-wide text-stone-600">
            <span className="w-7 shrink-0 text-right">#</span>
            <span className="w-8 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">User</span>
            <span className="w-12 shrink-0 text-right">Pts</span>
          </div>
        </div>

        <ul>
          {displayList.map((entry) => {
            const isUser = !!entry.isUser;
            const isStickyUser = isUser;
            const stickyBg =
              isStickyUser && userColor
                ? isLightColor(userColor)
                  ? darken(userColor, 0.35)
                  : userColor
                : '';
            const stickyStyle = isStickyUser
              ? stickyBg
                ? { backgroundColor: stickyBg }
                : { backgroundColor: '#1C4188' }
              : undefined;
            return (
              <li
                key={entry.rank}
                className={
                  isStickyUser
                    ? 'sticky top-[36px] bottom-0 z-[8] border-y border-brand-line shadow-[0_4px_12px_rgba(0,0,0,0.08),0_-4px_12px_rgba(0,0,0,0.08)]'
                    : ''
                }
                style={stickyStyle}
              >
                <ListRow
                  rank={entry.rank}
                  name={entry.name}
                  points={entry.points}
                  isUser={isUser}
                  userColor={userColor}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
