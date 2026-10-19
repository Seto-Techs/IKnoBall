import { useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Unlink } from 'lucide-react';
import { FaDiscord } from 'react-icons/fa6';
import { useAccounts, useLinkDiscord, useUnlinkAccount } from '../../lib/use-account';
import { Button, SaveHint, SettingsCard, type SaveState } from './parts';

/**
 * Which sign-in methods are attached to this account.
 *
 * `credential` is email + password and cannot be removed on its own — Better
 * Auth refuses with `FAILED_TO_UNLINK_LAST_ACCOUNT` — so the row states that
 * instead of offering a button that always fails.
 *
 * Discord linking is real: `link-social` returns an authorise URL and this sends
 * the browser to it. The provider sets `prompt: 'consent'`, so Discord shows its
 * approval screen instead of rejecting a first-time authorisation.
 */
export function ConnectionsSection({ enabled }: { enabled: boolean }) {
  const { data: accounts, isPending } = useAccounts(enabled);
  const linkDiscord = useLinkDiscord();
  const unlink = useUnlinkAccount();
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  const discord = accounts?.find((a) => a.providerId === 'discord') ?? null;
  const credential = accounts?.find((a) => a.providerId === 'credential') ?? null;

  return (
    <SettingsCard
      title="Connected accounts"
      description="Sign-in methods attached to this profile."
      footer={<SaveHint state={state} />}
    >
      {isPending ? (
        <p className="py-2 text-sm text-stone-400">Loading…</p>
      ) : (
        <ul className="space-y-2">
          <ProviderRow
            icon={
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-stone-100">
                <Link2 className="h-4 w-4 text-stone-500" aria-hidden="true" />
              </span>
            }
            name="Email & password"
            detail={credential ? 'Used to sign in on this account' : 'Not set up'}
            action={
              credential ? (
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Required
                </span>
              ) : null
            }
          />

          <ProviderRow
            icon={
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#5865F2]">
                <FaDiscord className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
            }
            name="Discord"
            detail={
              discord
                ? 'Linked — your Discord avatar is used when you have none'
                : 'Link to sign in with Discord and pull your avatar'
            }
            action={
              discord ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`https://discord.com/users/${discord.accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand-navy hover:text-brand-red"
                  >
                    Profile
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1.5"
                    pending={unlink.isPending}
                    onClick={() => {
                      setState({ kind: 'idle' });
                      unlink.mutate('discord', {
                        onSuccess: () => setState({ kind: 'saved' }),
                        onError: (err) => setState({ kind: 'error', message: err.message }),
                      });
                    }}
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                    Unlink
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5"
                  pending={linkDiscord.isPending}
                  onClick={() => {
                    setState({ kind: 'idle' });
                    linkDiscord.mutate(`${window.location.origin}/profile`, {
                      onError: (err) => setState({ kind: 'error', message: err.message }),
                    });
                  }}
                >
                  <FaDiscord className="h-3.5 w-3.5 text-[#5865F2]" aria-hidden="true" />
                  Link Discord
                </Button>
              )
            }
          />
        </ul>
      )}

      {discord && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Connected
        </p>
      )}
    </SettingsCard>
  );
}

function ProviderRow({
  icon,
  name,
  detail,
  action,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-brand-line px-3 py-2.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-ink">{name}</p>
        <p className="truncate text-[11px] text-stone-400">{detail}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
