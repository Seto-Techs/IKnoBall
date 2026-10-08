import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PlayerStat, TeamRecord, TeamWithLeaders } from '../../lib/api';
import { hexLuminance } from '../dashboard/shared';

function FormDots({ record }: { record?: TeamRecord | null }) {
  if (!record || record.lastGames.length === 0) {
    return <span className="text-xs italic text-stone-400">No recent games</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      {record.lastGames.map((g, i) => {
        const won = g.isHome ? g.ourScore > g.oppScore : g.ourScore > g.oppScore;
        return (
          <span
            key={i}
            title={`${won ? 'W' : 'L'} vs ${g.opponentAbbr} ${g.ourScore}-${g.oppScore}`}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
              won ? 'bg-emerald-500 text-white' : 'bg-brand-red text-white'
            }`}
          >
            {won ? 'W' : 'L'}
          </span>
        );
      })}
    </div>
  );
}

const STAT_LABELS: { key: keyof PlayerStat; label: string; suffix: string }[] = [
  { key: 'points', label: 'PPG', suffix: '' },
  { key: 'rebounds', label: 'RPG', suffix: '' },
  { key: 'assists', label: 'APG', suffix: '' },
];

function PlayerRow({ p }: { p: PlayerStat }) {
  return (
    <div className="flex items-center gap-2 py-2">
      {p.headshotUrl ? (
        <img
          src={p.headshotUrl}
          alt={p.name}
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-full object-cover bg-stone-200"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-500">
          {p.name.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-ink">{p.name}</p>
        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
          {p.position}
        </p>
      </div>
      <div className="flex shrink-0 gap-3">
        {STAT_LABELS.map((s) => (
          <div key={s.label} className="w-10 text-right">
            <div className="text-sm font-bold tabular-nums text-brand-navy">
              {Number(p[s.key] ?? 0).toFixed(1)}
            </div>
            <div className="text-xs font-bold uppercase tracking-widest text-stone-500">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamCard({
  team,
  record,
  players,
  loading,
  side,
  accentColor,
}: {
  team: TeamWithLeaders;
  record?: TeamRecord | null;
  players?: PlayerStat[];
  loading?: boolean;
  side: 'away' | 'home';
  accentColor: string;
}) {
  const [open, setOpen] = useState(true);
  const isBright = hexLuminance(team.primaryColor) > 0.45;
  const tx = isBright ? 'text-brand-ink' : 'text-white';
  const txMuted = isBright ? 'text-brand-ink/75' : 'text-white/75';

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm">
      {/* Identity header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ backgroundColor: team.primaryColor }}
      >
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={team.fullName}
            className="h-12 w-12 shrink-0 object-contain drop-shadow"
            loading="lazy"
          />
        ) : (
          <span className={`font-heading text-2xl font-black ${tx}`}>{team.abbreviation}</span>
        )}
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-widest ${txMuted}`}>
            {side === 'away' ? 'Away' : 'Home'}
          </p>
          <h3 className={`truncate font-heading text-xl font-black uppercase tracking-wide ${tx}`}>
            {team.teamName}
          </h3>
          <p className={`text-xs font-semibold ${txMuted}`}>
            {team.conference === 'East' ? 'Eastern' : 'Western'} · {team.division}
          </p>
        </div>
      </div>

      {/* Record + form */}
      <div className="flex items-center justify-between border-b border-brand-line px-5 py-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="font-heading text-2xl font-black leading-none tabular-nums text-brand-ink">
              {record ? `${record.wins}-${record.losses}` : '—'}
            </p>
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Record</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-500">Last 5</p>
            <FormDots record={record} />
          </div>
        </div>
        <div className="text-right text-xs text-stone-500">
          <p className="font-semibold text-brand-ink">{team.headCoach}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
            Head Coach
          </p>
        </div>
      </div>

      {/* Coaches / arena quick facts */}
      <div className="grid grid-cols-2 gap-px border-b border-brand-line bg-brand-line">
        <div className="bg-white px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Arena</p>
          <p className="truncate text-sm font-semibold text-brand-ink">{team.arena}</p>
        </div>
        <div className="bg-white px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
            Logo / Code
          </p>
          <p className="text-sm font-semibold text-brand-ink">{team.abbreviation}</p>
        </div>
      </div>

      {/* Leaders / key players */}
      <div className="px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between py-3 text-left"
          aria-expanded={open}
        >
          <span className="text-xs font-bold uppercase tracking-widest text-stone-500">
            Key Players
          </span>
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-brand-navy">
            {open ? 'Hide' : 'Show'}
            {open ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </span>
        </button>
        {open && (
          <div className="divide-y divide-brand-line pb-3">
            {loading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex animate-pulse items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-stone-200" />
                    <div className="h-4 flex-1 rounded bg-stone-100" />
                  </div>
                ))}
              </div>
            ) : players && players.length > 0 ? (
              players.slice(0, 6).map((p) => <PlayerRow key={p.id} p={p} />)
            ) : (
              <p className="py-3 text-sm italic text-stone-400">No player data yet</p>
            )}
          </div>
        )}
      </div>

      {/* Accent footer */}
      <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
    </div>
  );
}
