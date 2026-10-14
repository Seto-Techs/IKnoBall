import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { PlayerDetail, PlayerSeasonStats } from '../../lib/api';
import { hexLuminance } from '../../lib/game-utils';

const DARK_TEXT_SHADOW = { textShadow: '0 2px 10px rgba(0,0,0,0.35)' };

/** The headline averages the hero leads with, in reading order. */
const HEADLINE_STATS: { label: string; value: (season: PlayerSeasonStats) => number | null }[] = [
  { label: 'PPG', value: (s) => s.points },
  { label: 'RPG', value: (s) => s.rebounds },
  { label: 'APG', value: (s) => s.assists },
];

/**
 * Headshot with an initials fallback. The CDN serves the large crop for every
 * player, but a missing file or an offline CDN should still leave the hero
 * legible rather than showing a broken image.
 */
function Headshot({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/25 ring-1 ring-white/25 sm:h-40 sm:w-32">
      {failed ? (
        <span className="font-heading text-4xl font-black tracking-wide text-white/80">
          {initials}
        </span>
      ) : (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/**
 * One label/value pair. The label takes its own colour rather than inheriting:
 * the hero sits on the team's primary colour, which ranges from near-black to
 * near-white, so an inherited colour is invisible on half the league.
 */
function Fact({
  label,
  value,
  tone,
  labelTone,
}: {
  label: string;
  value: string | null;
  tone: string;
  labelTone: string;
}) {
  return (
    <div className="min-w-0">
      <dt className={`text-[11px] font-bold uppercase tracking-widest ${labelTone}`}>{label}</dt>
      <dd className={`truncate text-sm font-semibold ${tone}`}>{value ?? '—'}</dd>
    </div>
  );
}

/**
 * Per-game averages for the season the API summarised. Only rendered when the
 * player has a season on file, so an empty profile keeps a clean hero instead of
 * three dashes; the Season Stats panel states the absence in words.
 */
function HeadlineStats({ season, tone }: { season: PlayerSeasonStats; tone: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <p className={`text-[11px] font-bold uppercase tracking-widest ${tone} opacity-70`}>
        {season.season} · {season.seasonType === 'playoffs' ? 'Playoffs' : 'Regular Season'}
      </p>
      <div className="flex items-baseline gap-5 sm:gap-7">
        {HEADLINE_STATS.map((stat) => (
          <div key={stat.label}>
            <p
              className={`font-heading text-3xl font-black leading-none tabular-nums sm:text-4xl ${tone}`}
            >
              {stat.value(season)?.toFixed(1) ?? '—'}
            </p>
            <p
              className={`mt-1 text-[11px] font-bold uppercase tracking-widest ${tone} opacity-70`}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "2023 · R1 P1", or Undrafted when the feed has no draft year. */
function draftLabel(player: PlayerDetail): string {
  if (!player.draftYear) return 'Undrafted';
  const round = player.draftRound ? `R${player.draftRound}` : null;
  const pick = player.draftPick ? `P${player.draftPick}` : null;
  return [String(player.draftYear), [round, pick].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
}

/** The seasons the player has been on file for, e.g. "2012–2026". */
function careerLabel(player: PlayerDetail): string | null {
  if (!player.careerFrom) return null;
  if (!player.careerTo || player.careerTo === player.careerFrom) return player.careerFrom;
  return `${player.careerFrom}–${player.careerTo}`;
}

/**
 * Full-width identity card for a player: portrait, team, the season's headline
 * averages, and the physical and career facts a profile leads with. The team's
 * primary colour fills the card, so the text tone flips to ink on the bright
 * ones (gold, silver).
 */
export function PlayerHero({ player, onBack }: { player: PlayerDetail; onBack?: () => void }) {
  const teamColor = player.team?.primaryColor || '#1C4188';
  const bright = hexLuminance(teamColor) > 0.45;
  const tone = bright ? 'text-brand-ink' : 'text-white';
  const muted = bright ? 'text-brand-ink/70' : 'text-white/75';
  const hideOnError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.style.display = 'none';
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-line shadow-sm">
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ backgroundColor: teamColor }} />
        <div
          className="absolute inset-0"
          style={{
            background: bright
              ? 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.12) 100%)'
              : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(255,255,255,0.06) 42%, rgba(0,0,0,0.2) 100%)',
          }}
        />
        <div
          className={`absolute inset-0 ${bright ? 'opacity-[0.06]' : 'opacity-[0.16]'}`}
          style={{
            backgroundImage: `radial-gradient(circle, ${
              bright ? 'rgba(0,0,0,0.96)' : 'rgba(255,255,255,0.96)'
            } 1.05px, transparent 1.35px)`,
            backgroundSize: '11px 11px',
          }}
        />
      </div>

      {onBack && (
        <div className="relative z-20 px-6 pt-5 sm:px-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-md bg-black/35 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-black/50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
          </button>
        </div>
      )}

      {/* The Back control sits in the flow above this row, so the portrait never
          starts underneath it. */}
      <div className="relative z-10 flex flex-col gap-5 px-6 pt-5 sm:px-8 sm:pt-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-7">
          <div className="flex min-w-0 items-center gap-5 sm:gap-6">
            <Headshot src={player.headshotUrl} name={player.name} />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {player.team?.logoUrl ? (
                  <img
                    src={player.team.logoUrl}
                    alt=""
                    className="h-7 w-7 shrink-0 object-contain drop-shadow"
                    loading="lazy"
                    onError={hideOnError}
                  />
                ) : null}
                <span className={`truncate text-xs font-bold uppercase tracking-widest ${muted}`}>
                  {player.team ? player.team.fullName : 'Free agent'}
                </span>
              </div>
              <h1
                className={`mt-1 font-heading text-3xl font-black uppercase leading-none tracking-wide sm:text-5xl ${tone}`}
                style={bright ? undefined : DARK_TEXT_SHADOW}
              >
                {player.name}
              </h1>
              <p className={`mt-2 text-sm font-semibold ${muted}`}>
                {[player.jersey ? `#${player.jersey}` : null, player.position]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </div>
          </div>

          {player.currentSeason ? (
            <HeadlineStats season={player.currentSeason} tone={tone} />
          ) : null}
        </div>

        <dl
          className={`grid grid-cols-2 gap-x-6 gap-y-3 border-t pb-6 pt-4 sm:grid-cols-3 sm:pb-7 lg:grid-cols-6 ${
            bright ? 'border-black/10' : 'border-white/15'
          }`}
        >
          <Fact label="Height" value={player.height} tone={tone} labelTone={muted} />
          <Fact
            label="Weight"
            value={player.weight ? `${player.weight} lbs` : null}
            tone={tone}
            labelTone={muted}
          />
          <Fact label="Country" value={player.country} tone={tone} labelTone={muted} />
          <Fact label="College" value={player.college} tone={tone} labelTone={muted} />
          <Fact label="Draft" value={draftLabel(player)} tone={tone} labelTone={muted} />
          <Fact label="Career" value={careerLabel(player)} tone={tone} labelTone={muted} />
        </dl>
      </div>
    </div>
  );
}
