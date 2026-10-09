import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Panel } from '../dashboard/shared';
import {
  useHeadToHead,
  type SeriesMeeting,
  type SeriesTeam,
  type TeamWithLeaders,
} from '../../lib/api';
import { formatDateOnly } from '../../lib/game-utils';
import { buildPages } from '../../lib/pagination';

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
 * One prior-season meeting, styled after the league-wide "Previous Game Day"
 * cards: a diagonal split in the two teams' colours with the final score.
 */
function MeetingCard({
  meeting,
  awayTeam,
  homeTeam,
}: {
  meeting: SeriesMeeting;
  awayTeam: TeamWithLeaders | null;
  homeTeam: TeamWithLeaders | null;
}) {
  const pick = (tricode: string | null, fullName: string) =>
    [awayTeam, homeTeam].find(
      (t) => t && (t.abbreviation === tricode || t.fullName === fullName),
    ) ?? null;

  const meetingAway = pick(meeting.awayTricode, meeting.awayTeam);
  const meetingHome = pick(meeting.homeTricode, meeting.homeTeam);
  // Team colours, matching the league-wide result cards this style comes from.
  const awayColor = meetingAway?.primaryColor ?? '#2B2B2B';
  const homeColor = meetingHome?.primaryColor ?? '#1C4188';
  const awayScore = meeting.awayScore ?? 0;
  const homeScore = meeting.homeScore ?? 0;
  const awayWon = awayScore > homeScore;

  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  };

  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: meeting.id }}
      className="group block overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative flex h-[112px] shrink-0 items-center overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: awayColor,
              clipPath: 'polygon(0 0, 61% 0, 41% 100%, 0 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: homeColor,
              clipPath: 'polygon(61% 0, 100% 0, 100% 100%, 41% 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(255,255,255,0.04) 42%, rgba(0,0,0,0.18) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-1 px-2">
          {meetingAway?.logoUrl ? (
            <img
              src={meetingAway.logoUrl}
              alt=""
              className="h-9 w-9 object-contain drop-shadow"
              loading="lazy"
              onError={hideOnError}
            />
          ) : null}
          <span
            className={`font-heading text-sm font-black uppercase tracking-wide text-white ${
              awayWon ? '' : 'opacity-60'
            }`}
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
          >
            {meeting.awayTricode}
          </span>
        </div>

        <span className="relative z-10 shrink-0 rounded-full bg-black/75 px-2.5 py-1 font-heading text-sm font-black tabular-nums text-white ring-1 ring-white/20 backdrop-blur">
          {awayScore}–{homeScore}
        </span>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-1 px-2">
          {meetingHome?.logoUrl ? (
            <img
              src={meetingHome.logoUrl}
              alt=""
              className="h-9 w-9 object-contain drop-shadow"
              loading="lazy"
              onError={hideOnError}
            />
          ) : null}
          <span
            className={`font-heading text-sm font-black uppercase tracking-wide text-white ${
              awayWon ? 'opacity-60' : ''
            }`}
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
          >
            {meeting.homeTricode}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-brand-line px-3 py-1.5">
        <span className="text-xs font-medium text-stone-500">
          {formatDateOnly(meeting.gameDate, 'MMM d, yyyy')}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-brand-navy opacity-0 transition group-hover:opacity-100">
          View
        </span>
      </div>
    </Link>
  );
}

const MEETINGS_PER_PAGE = 2;

/**
 * Prior-season regular-season series between the two teams in this game. The
 * record leads; the meetings sit in a two-up carousel, each card linking to its
 * own game detail page.
 */
export function AtAGlance({
  gameId,
  awayTeam,
  homeTeam,
}: {
  gameId: string;
  awayTeam?: TeamWithLeaders | null;
  homeTeam?: TeamWithLeaders | null;
}) {
  const { data, isLoading } = useHeadToHead(gameId);
  const [page, setPage] = useState(0);

  const pages = useMemo(() => buildPages(data?.meetings ?? [], MEETINGS_PER_PAGE), [data]);
  const totalPages = pages.length;

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  // A different game is a different series, so start it back at the first page.
  useEffect(() => {
    setPage(0);
  }, [gameId]);

  const go = useCallback(
    (next: number) => {
      if (totalPages <= 1) return;
      setPage(((next % totalPages) + totalPages) % totalPages);
    },
    [totalPages],
  );

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

  const { season, meetings } = data;
  const showSlider = totalPages > 1;

  return (
    <Panel title="At a Glance">
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
            {season} regular season · {meetings.length}{' '}
            {meetings.length === 1 ? 'meeting' : 'meetings'}
          </p>

          {showSlider && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous meetings"
                onClick={() => go(page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-line text-stone-500 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40"
              >
                ‹
              </button>
              <span className="text-xs font-medium tabular-nums text-stone-500">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Next meetings"
                onClick={() => go(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-line text-stone-500 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40"
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <SeriesSide team={data.away} leading={data.away.wins > data.home.wins} />
          <span className="text-xs font-bold uppercase tracking-widest text-stone-500">Series</span>
          <SeriesSide team={data.home} leading={data.home.wins > data.away.wins} align="right" />
        </div>

        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {pages.map((pageMeetings, index) => (
              <div key={index} className="w-full shrink-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {pageMeetings.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      awayTeam={awayTeam ?? null}
                      homeTeam={homeTeam ?? null}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
