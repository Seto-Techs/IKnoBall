import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Unlink } from 'lucide-react';
import { FaDiscord } from 'react-icons/fa6';
import { DashboardHeader } from '../components/dashboard/Header';
import {
  Button,
  Field,
  SettingsCard,
  SaveHint,
  inputClass,
  type SaveState,
} from '../components/profile/parts';
import { useLinkDiscord } from '../lib/use-account';
import { useSession, useSignOut } from '../lib/use-auth';

/**
 * `/settings/discord` — where a `/link` code is spent, and where the bot link is
 * disconnected (DISC-06, path A).
 *
 * Signed in only, because the whole point of the page is that the session proves
 * *which* IKnoBall account the Discord id joins. The code only proves which
 * Discord id: it is a ten-minute, single-use token minted by `/link`, and this
 * page hands it to the API together with the session cookie. Nothing about the
 * account comes from the URL.
 *
 * Three states, in the order the page finds them:
 *
 * - a `?code=` in the URL — spend it on mount, then drop it from the URL so a
 *   refresh does not replay a code that has already been consumed;
 * - linked through Discord sign-in (`account` row) — clicks already land here, so
 *   the page says so rather than asking for a code nobody needs;
 * - linked through `discord_links` — show which Discord account and offer
 *   Disconnect.
 */

const API = import.meta.env.DEV ? '/api' : `${import.meta.env.VITE_API_URL ?? ''}/api`;

/** Matches `DiscordLinkService.DiscordLinkStatus`. */
interface DiscordLinkStatus {
  discordUserId: string | null;
  source: 'account' | 'link' | 'none';
  signInMethod: boolean;
}

/** Matches `DiscordLinkService.RemovedLink`. */
interface RemovedLink {
  removed: boolean;
  stillResolvable: boolean;
}

interface ApiEnvelope<T> {
  is_success: boolean;
  message: string | string[];
  data: T | null;
}

async function callApi<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method,
    // The session cookie is the identity half of the handshake.
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok)
    throw new Error(messageOf(payload) ?? `${response.status} ${response.statusText}`);
  return payload?.data as T;
}

/** Nest sends a string, a Zod failure sends an array; both are shown verbatim. */
function messageOf(payload: ApiEnvelope<unknown> | null): string | null {
  if (!payload) return null;
  if (Array.isArray(payload.message)) return payload.message.join('; ');
  return payload.message?.trim() || null;
}

function useDiscordLink(enabled: boolean) {
  return useQuery({
    queryKey: ['discord-link'],
    queryFn: () => callApi<DiscordLinkStatus>('GET', '/me/discord'),
    enabled,
    staleTime: 1000 * 30,
  });
}

function useConsumeCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      callApi<{ discordUserId: string }>('POST', '/me/discord', { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord-link'] });
      // The profile's "Connected accounts" list reads Better Auth, which this
      // does not write — but the row it shows and this page can disagree until
      // both are refetched, so refresh it too.
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callApi<RemovedLink>('DELETE', '/me/discord'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord-link'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export const Route = createFileRoute('/settings/discord')({
  // A code pasted from Discord can carry stray whitespace or lower case; both are
  // safe to fix here, and the API normalises the same way.
  validateSearch: (search: Record<string, unknown>): { code?: string } => {
    const raw = typeof search.code === 'string' ? search.code.trim().toUpperCase() : '';
    return { code: raw ? raw.slice(0, 16) : undefined };
  },
  component: DiscordSettingsPage,
});

function DiscordSettingsPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending, isFetching } = useSession();
  const user = session?.user;

  const status = useDiscordLink(!!user);
  const consume = useConsumeCode();
  const disconnect = useDisconnect();
  const linkDiscord = useLinkDiscord();
  const signOut = useSignOut();

  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [manual, setManual] = useState('');
  const [disconnected, setDisconnected] = useState<RemovedLink | null>(null);

  // `useRef` rather than state: the guard has to hold across the re-render the
  // mutation itself causes, or a code would be posted twice.
  const spending = useRef<string | null>(null);

  useEffect(() => {
    if (isPending || isFetching) return;
    if (!user) navigate({ to: '/auth/login' });
  }, [isPending, isFetching, user, navigate]);

  useEffect(() => {
    if (!user || !code || spending.current === code) return;
    spending.current = code;

    consume.mutate(code, {
      onSuccess: () => {
        setState({ kind: 'saved' });
        setManual('');
        // Drop the spent code: a refresh must not replay it, and the code is a
        // credential that has no business staying in history.
        navigate({ to: '/settings/discord', search: {}, replace: true });
      },
      onError: (error: Error) => {
        setState({ kind: 'error', message: error.message });
      },
    });
  }, [user, code, consume, navigate]);

  if (isPending || isFetching) return null;
  if (!user) return null;

  const discord = status.data ?? null;

  const spendManual = () => {
    const typed = manual.trim().toUpperCase();
    if (!typed) return;
    setState({ kind: 'idle' });
    setDisconnected(null);
    consume.mutate(typed, {
      onSuccess: () => {
        setState({ kind: 'saved' });
        setManual('');
      },
      onError: (error: Error) => setState({ kind: 'error', message: error.message }),
    });
  };

  const disconnectLink = () => {
    setState({ kind: 'idle' });
    setDisconnected(null);
    disconnect.mutate(undefined, {
      onSuccess: (result) => {
        setDisconnected(result);
        setState({ kind: result.removed ? 'saved' : 'idle' });
      },
      onError: (error: Error) => setState({ kind: 'error', message: error.message }),
    });
  };

  const signOutAndLeave = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate({ to: '/' });
      },
    });
  };

  return (
    <div className="flex-1 bg-stone-200">
      <DashboardHeader
        userName={user.name}
        userImage={user.image}
        accentColor="#1C4188"
        onSignOut={signOutAndLeave}
        active="profile"
      />

      <div className="mx-auto max-w-[840px] px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h1 className="font-heading text-2xl font-black uppercase tracking-wide text-brand-ink">
            Discord
          </h1>
          <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-stone-600">
            Link the Discord account you play in to this IKnoBall account, so a pick you click in
            Discord lands on the same profile as the website.
          </p>
        </header>

        <div className="flex flex-col gap-5">
          <SettingsCard
            title="Link status"
            description="Which Discord account answers when you click a pick button."
            footer={<SaveHint state={state} />}
          >
            {status.isPending ? (
              <p className="py-2 text-sm text-stone-400">Loading…</p>
            ) : (
              <StatusBody status={discord} />
            )}

            {disconnected && (
              <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
                {disconnected.removed
                  ? 'Disconnected. Your picks are untouched.'
                  : 'There was no bot link to remove.'}
                {disconnected.stillResolvable &&
                  ' This account still signs in with Discord, so your clicks still land on it — remove the Discord sign-in on your profile to stop that.'}
              </p>
            )}

            {discord && discord.discordUserId && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="!px-2.5 !py-1.5"
                  pending={disconnect.isPending}
                  onClick={disconnectLink}
                >
                  <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  Disconnect Discord
                </Button>
                <span className="text-xs text-stone-400">
                  Deletes the bot link only. No picks are deleted.
                </span>
              </div>
            )}
          </SettingsCard>

          <SettingsCard
            title="Link with a code"
            description="Run /link in Discord, then paste the six-character code here."
            footer={
              <Button pending={consume.isPending} disabled={!manual.trim()} onClick={spendManual}>
                Link Discord
              </Button>
            }
          >
            <Field label="Linking code" hint="Codes are single use and expire after ten minutes.">
              <input
                className={`${inputClass} max-w-[220px] font-mono uppercase tracking-[0.3em]`}
                value={manual}
                onChange={(event) => setManual(event.target.value.toUpperCase())}
                placeholder="ABC234"
                autoComplete="one-time-code"
                spellCheck={false}
                maxLength={16}
                aria-label="Linking code"
              />
            </Field>

            <p className="mt-4 border-t border-brand-line pt-4 text-sm leading-relaxed text-stone-600">
              No code? If you sign in to IKnoBall with Discord, linking is one click and needs no
              code at all.
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              pending={linkDiscord.isPending}
              onClick={() => {
                setState({ kind: 'idle' });
                linkDiscord.mutate(`${window.location.origin}/settings/discord`, {
                  onError: (error: Error) => setState({ kind: 'error', message: error.message }),
                });
              }}
            >
              <FaDiscord className="h-3.5 w-3.5 text-[#5865F2]" aria-hidden="true" />
              Connect with Discord
            </Button>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}

/** The three states `resolve` can answer with, each said plainly. */
function StatusBody({ status }: { status: DiscordLinkStatus | null }) {
  if (!status || status.source === 'none' || !status.discordUserId) {
    return (
      <p className="text-sm leading-relaxed text-stone-600">
        Not linked yet. Click a pick button in Discord and you will be asked to link, or run{' '}
        <code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">/link</code> and paste the
        code below.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm text-stone-700">
      <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {status.source === 'account' ? 'Linked through Discord sign-in' : 'Linked with a code'}
      </p>
      <p className="flex items-center gap-2">
        <span className="text-stone-500">Discord account</span>
        <a
          href={`https://discord.com/users/${status.discordUserId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-navy hover:text-brand-red"
        >
          {status.discordUserId}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </p>
      <p className="text-xs leading-relaxed text-stone-500">
        {status.source === 'account'
          ? 'You sign in with Discord, so clicks in Discord already land on this account.'
          : 'Clicks in Discord land on this account.'}{' '}
        Manage sign-in methods on your <Link to="/profile">profile</Link>.
      </p>
    </div>
  );
}
