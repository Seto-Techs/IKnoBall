import { GiCrown, GiMedal, GiTrophyCup, GiWeightScale } from 'react-icons/gi';
import { LoadingSpinner, EmptyState, Panel } from './shared';
import { darken, isLightColor } from '../../lib/color';

/** Display shape for one leaderboard row. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
}

/*
 * Two surfaces, two limits. The rankings page lists the top 49 and then your own
 * row — 50 at most, so the cut never lands on you. The dashboard rail keeps the
 * whole board behind a ten-row viewport and scrolls through it.
 */
const PAGE_TOP_ROWS = 49;

/** One list row's height, fixed by `h-12` in `ListRow`. */
const ROW_HEIGHT = 48;

/** Rows the rail's scrollport shows at once; the rest scroll behind them. */
const RAIL_VISIBLE_ROWS = 10;

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
      className={`flex h-12 items-center gap-3 px-5 ${isUser ? 'bg-brand-navy' : medalRowBg} ${medal ? medalBorder : ''}`}
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
 * One board. `scrollable` is the dashboard rail: a fixed-height box that scrolls
 * on its own with the user's row pinned top and bottom. The rankings page turns
 * it off so the top 49 plus the user's own row flow with the document instead of
 * nesting a second scrollbar inside the page.
 */
export function LeaderboardPanel({
  title,
  weighted,
  entries,
  userRank,
  userPoints,
  userName,
  userColor,
  loading = false,
  scrollable = true,
}: {
  title: string;
  weighted?: boolean;
  entries: LeaderboardEntry[];
  userRank: number;
  userPoints: number;
  userName?: string;
  userColor?: string;
  loading?: boolean;
  scrollable?: boolean;
}) {
  const userLabel = userName || 'You';
  // The rail scrolls its own ten-row box, so it keeps every row the API sent.
  // The page flows with the document and is capped instead: the top 49 and then
  // your own row, so the cut never lands on you.
  const rows = scrollable || userRank === 0 ? entries : entries.slice(0, PAGE_TOP_ROWS);
  const showUserRow = userRank > 0 && !rows.some((entry) => entry.rank === userRank);
  const displayList: (LeaderboardEntry & { isUser?: boolean })[] = showUserRow
    ? [
        ...rows.map((entry) => ({ ...entry, isUser: false })),
        { rank: userRank, name: userLabel, points: userPoints, isUser: true },
      ]
    : rows.map((entry) => ({ ...entry, isUser: entry.rank === userRank }));
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
      {loading ? (
        <div className="py-10">
          <LoadingSpinner />
        </div>
      ) : displayList.length === 0 ? (
        <EmptyState message="No settled picks yet. The board fills in once the first games are scored." />
      ) : (
        <div>
          <div className="bg-white">
            <div className="flex items-center gap-3 px-5 pb-1 pt-3 text-sm font-semibold uppercase tracking-wide text-stone-600">
              <span className="w-7 shrink-0 text-right">#</span>
              <span className="w-8 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">User</span>
              <span className="w-12 shrink-0 text-right">Pts</span>
            </div>
          </div>

          <div
            className={scrollable ? 'overflow-y-auto overscroll-contain scrollbar-hide' : ''}
            style={scrollable ? { maxHeight: RAIL_VISIBLE_ROWS * ROW_HEIGHT } : undefined}
          >
            <ul>
              {displayList.map((entry) => {
                const isUser = !!entry.isUser;
                const isStickyUser = isUser && scrollable;
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
                        ? 'sticky top-0 bottom-0 z-[8] outline outline-1 -outline-offset-1 outline-brand-line shadow-[0_4px_12px_rgba(0,0,0,0.08),0_-4px_12px_rgba(0,0,0,0.08)]'
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
        </div>
      )}
    </Panel>
  );
}
