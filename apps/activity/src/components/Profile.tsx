import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { fetchTeams, setFavoriteTeam, useResource, type Me } from '../lib/api';
import { Avatar, Spinner } from './kit';
import { canonicalAbbr } from '../lib/teams';

/**
 * Who you are, and the one setting the games read: your club.
 *
 * The activity has no sign-out, no password and no email field — Discord already
 * said who you are, and the backend resolved that to this account. So the sheet
 * is short on purpose: the identity, and the team the site's own profile asks
 * for, which is what tints a dashboard and seeds the chain game.
 */
export function ProfileSheet({
  me,
  onClose,
  onSaved,
}: {
  me: Me;
  onClose: () => void;
  onSaved: (me: Me) => void;
}) {
  const teams = useResource(fetchTeams);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = me.favoriteTeam ? canonicalAbbr(me.favoriteTeam) : null;

  async function choose(abbreviation: string) {
    if (saving || abbreviation === current) return;
    setSaving(abbreviation);
    setError(null);
    try {
      onSaved(await setFavoriteTeam(abbreviation));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That team could not be saved.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-brand-navyDark/40">
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <section
        role="dialog"
        aria-label="Your profile"
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-brand-line px-4 py-3">
          <Avatar name={me.name} image={me.image} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[19px] font-semibold uppercase leading-none tracking-wide text-brand-ink">
              {me.name}
            </p>
            <p className="mt-1 truncate text-[12.5px] text-stone-500">
              Signed in with Discord · no password
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-brand-cream hover:text-brand-navy"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <h2 className="font-heading text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-navyDark">
            Your club
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
            {current
              ? 'Set the club the board follows. Tap another to change it.'
              : 'Pick the club you follow — it is the one thing the games ask about you.'}
          </p>

          {error && <p className="mt-2 text-[13px] font-medium text-brand-red">{error}</p>}

          {teams.loading ? (
            <Spinner label="Loading teams" />
          ) : teams.error ? (
            <p className="mt-3 text-[13px] text-brand-red">{teams.error}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-6">
              {(teams.data ?? []).map((team) => {
                const picked = canonicalAbbr(team.abbreviation) === current;
                return (
                  <li key={team.abbreviation}>
                    <button
                      type="button"
                      onClick={() => void choose(team.abbreviation)}
                      disabled={saving !== null}
                      aria-pressed={picked}
                      title={team.fullName}
                      className={`flex h-14 w-full items-center justify-center rounded-lg border transition-colors ${
                        picked
                          ? 'border-brand-navy bg-brand-cream'
                          : 'border-brand-line bg-white hover:bg-stone-50'
                      }`}
                    >
                      {team.logoUrl ? (
                        <img
                          src={team.logoUrl}
                          alt={team.fullName}
                          className="h-8 w-8 object-contain"
                        />
                      ) : (
                        <span className="font-heading text-[11px] font-bold text-stone-500">
                          {team.abbreviation}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {saving && (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-stone-500">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Saving…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
