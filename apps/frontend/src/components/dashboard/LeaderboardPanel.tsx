import { GiCrown, GiMedal, GiTrophyCup, GiWeightScale } from 'react-icons/gi';
import type { IconType } from 'react-icons';
import type { LeaderboardEntry } from '../../lib/mock-data';
import { Panel } from './shared';

/* The top 10 are visible before the list starts scrolling internally. */
const TOP_VISIBLE = 10;

type PodiumTier = {
  rank: 1 | 2 | 3;
  label: string;
  icon: IconType;
  iconSize: string;
  column: string;
  iconClass: string;
  labelClass: string;
  nameClass: string;
  pointsClass: string;
};

/* 2nd / 1st / 3rd — classic podium order. 1st is the navy hero column. */
const PODIUM: PodiumTier[] = [
  {
    rank: 2,
    label: '2ND',
    icon: GiMedal,
    iconSize: 'h-12 w-12',
    column: 'border-stone-300 bg-stone-50',
    iconClass: 'text-stone-500',
    labelClass: 'text-stone-500',
    nameClass: 'text-brand-ink',
    pointsClass: 'text-stone-600',
  },
  {
    rank: 1,
    label: '1ST',
    icon: GiTrophyCup,
    iconSize: 'h-14 w-14',
    column: 'border-brand-navy bg-brand-navy',
    iconClass: 'text-brand-gold',
    labelClass: 'text-brand-gold',
    nameClass: 'text-white',
    pointsClass: 'text-white/85',
  },
  {
    rank: 3,
    label: '3RD',
    icon: GiMedal,
    iconSize: 'h-12 w-12',
    column: 'border-amber-700/40 bg-amber-700/10',
    iconClass: 'text-amber-700',
    labelClass: 'text-amber-700',
    nameClass: 'text-brand-ink',
    pointsClass: 'text-stone-600',
  },
];

function ListRow({
  rank,
  name,
  points,
  isUser,
}: {
  rank: number;
  name: string;
  points: number;
  isUser?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-5 py-2 ${isUser ? 'bg-brand-navy' : ''}`}>
      <span
        className={`w-7 shrink-0 text-right text-sm tabular-nums ${
          isUser ? 'font-semibold text-brand-gold' : 'text-stone-500'
        }`}
      >
        {rank}
      </span>
      {isUser ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/20"
          aria-hidden="true"
        >
          <GiCrown className="h-5 w-5 text-brand-gold" />
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
        className={`min-w-0 flex-1 truncate text-base font-medium ${isUser ? 'text-white' : 'text-brand-ink'}`}
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
 * A user leaderboard: illustrated podium (Game Icons) for the top 3, then a
 * ranked list that expands through rank 9 and scrolls internally past it.
 * The signed-in user is highlighted in place when ranked in the top 10,
 * otherwise pinned below the scroll with their actual position.
 */
export function LeaderboardPanel({
  title,
  weighted,
  entries,
  userRank,
  userPoints,
  userName,
}: {
  title: string;
  weighted?: boolean;
  entries: LeaderboardEntry[];
  userRank: number;
  userPoints: number;
  userName?: string;
}) {
  const userLabel = userName || 'You';
  const inBoard = userRank <= TOP_VISIBLE;
  const podium = entries.slice(0, 3);
  const list = entries.slice(3).filter((entry) => entry.rank !== userRank);

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
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        {PODIUM.map(
          ({ rank, label, icon: Icon, iconSize, column, iconClass, labelClass, nameClass, pointsClass }) => {
            const entry = podium.find((e) => e.rank === rank)!;
            const isUser = inBoard && entry.rank === userRank;
            return (
              <div
                key={rank}
                className={`relative flex flex-col items-center gap-1.5 rounded-lg border px-1 py-3 text-center ${column}`}
              >
                {isUser && rank !== 1 && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold"
                    aria-hidden="true"
                  >
                    <GiCrown className="h-3.5 w-3.5 text-brand-navyDark" />
                  </span>
                )}
                {rank === 1 && <GiCrown className="h-6 w-6 text-brand-gold" aria-hidden="true" />}
                <Icon className={`${iconSize} ${iconClass}`} aria-hidden="true" />
                <span className={`text-sm font-bold uppercase tracking-wide ${labelClass}`}>
                  {label}
                </span>
                <span
                  className={`w-full truncate text-base font-semibold ${nameClass}`}
                  title={entry.name}
                >
                  {isUser ? userLabel : entry.name}
                </span>
                <span className={`text-sm tabular-nums ${pointsClass}`}>{entry.points} pts</span>
              </div>
            );
          },
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 px-5 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-600">
        <span className="w-7 shrink-0 text-right">#</span>
        <span className="w-8 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">User</span>
        <span className="w-12 shrink-0 text-right">Pts</span>
      </div>

      <ul className="max-h-60 overflow-y-auto scrollbar-hide">
        {list.map((entry) => (
          <li key={entry.rank}>
            <ListRow
              rank={entry.rank}
              name={inBoard && entry.rank === userRank ? userLabel : entry.name}
              points={entry.points}
              isUser={inBoard && entry.rank === userRank}
            />
          </li>
        ))}
      </ul>

      {!inBoard && (
        <>
          <div aria-hidden="true" className="mx-5 border-t border-dashed border-brand-ink/20" />
          <ListRow rank={userRank} name={userLabel} points={userPoints} isUser />
        </>
      )}
    </Panel>
  );
}
