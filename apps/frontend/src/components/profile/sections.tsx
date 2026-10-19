import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera, ChevronRight, Mail, ShieldCheck, Upload } from 'lucide-react';
import {
  fileToAvatarDataUrl,
  useChangePassword,
  useRevokeOtherSessions,
  useSessions,
  useUpdateProfile,
  type ActiveSession,
} from '../../lib/use-account';
import { Avatar, Button, Field, SaveHint, SettingsCard, inputClass, type SaveState } from './parts';

/**
 * Identity: avatar, display name, and the read-only email.
 *
 * The email is shown but not editable on purpose — `POST /auth/change-email`
 * answers `CHANGE_EMAIL_DISABLED` because `user.changeEmail.enabled` is unset in
 * `auth.config.ts`. A form here would fail on submit, so the field states the
 * constraint instead of pretending otherwise.
 */
export function IdentitySection({
  name,
  email,
  image,
  verified,
}: {
  name: string;
  email: string;
  image: string | null;
  verified: boolean;
}) {
  const updateProfile = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftImage, setDraftImage] = useState<string | null>(image);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);

  const dirty = draftName.trim() !== name || draftImage !== image;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (!file.type.startsWith('image/')) {
      setFileError('That file is not an image.');
      return;
    }
    try {
      setDraftImage(await fileToAvatarDataUrl(file));
      setState({ kind: 'idle' });
    } catch {
      setFileError('Could not read that image. Try a PNG or JPG.');
    }
  };

  const save = () => {
    setState({ kind: 'idle' });
    updateProfile.mutate(
      { name: draftName.trim(), image: draftImage },
      {
        onSuccess: () => setState({ kind: 'saved' }),
        onError: (err) => setState({ kind: 'error', message: err.message }),
      },
    );
  };

  return (
    <SettingsCard
      title="Profile"
      description="How you appear on leaderboards and in the account menu."
      footer={
        <>
          <SaveHint state={state} />
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraftName(name);
                setDraftImage(image);
                setFileError(null);
                setState({ kind: 'idle' });
              }}
              className="!py-2"
            >
              Reset
            </Button>
          )}
          <Button onClick={save} disabled={!dirty} pending={updateProfile.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Avatar editor */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="group relative">
            <Avatar name={draftName || name} image={draftImage} size={96} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Change avatar"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-navyDark/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Camera className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-navy hover:text-brand-red"
          >
            <Upload className="h-3 w-3" aria-hidden="true" />
            Upload
          </button>
          {draftImage && draftImage !== image && (
            <button
              type="button"
              onClick={() => setDraftImage(image)}
              className="text-[11px] font-semibold text-stone-400 hover:text-brand-red"
            >
              Undo
            </button>
          )}
          {fileError && (
            <p className="max-w-[9rem] text-center text-[11px] font-medium text-brand-red">
              {fileError}
            </p>
          )}
        </div>

        {/* Fields */}
        <div className="min-w-0 flex-1 space-y-4">
          <Field label="Display name" hint="Shown on the leaderboard and in the header menu.">
            <input
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setState({ kind: 'idle' });
              }}
              maxLength={60}
              className={inputClass}
              placeholder="Your name"
            />
          </Field>

          <Field
            label="Email"
            hint={
              verified
                ? 'Verified. Changing your email is not available yet.'
                : 'Not verified yet — check your inbox.'
            }
          >
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300"
                aria-hidden="true"
              />
              <input value={email} readOnly disabled className={`${inputClass} pl-9`} />
            </div>
          </Field>

          {verified && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Email verified
            </p>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

/* ── Password ────────────────────────────────────────────── */

export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  // Only surfaced after a submit, so the form does not nag while typing.
  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm;

  const submit = () => {
    setState({ kind: 'idle' });
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setState({ kind: 'saved' });
          setCurrent('');
          setNext('');
          setConfirm('');
        },
        onError: (err) => setState({ kind: 'error', message: err.message }),
      },
    );
  };

  if (!hasPassword) {
    return (
      <SettingsCard
        title="Password"
        description="Your account signs in with Discord, so there is no password to change."
      >
        <p className="text-sm text-stone-500">
          Add a password to sign in without Discord. Not wired up yet — Better Auth exposes
          <code className="mx-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs">set-password</code>
          but the route is not enabled on this deployment.
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Password"
      description="Use at least 8 characters. You stay signed in on this device."
      footer={
        <>
          <SaveHint state={state} />
          <Button onClick={submit} disabled={!canSubmit} pending={changePassword.isPending}>
            Update password
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current">
          <input
            type="password"
            value={current}
            autoComplete="current-password"
            onChange={(e) => {
              setCurrent(e.target.value);
              setState({ kind: 'idle' });
            }}
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>
        <Field label="New" error={tooShort ? 'At least 8 characters.' : null}>
          <input
            type="password"
            value={next}
            autoComplete="new-password"
            onChange={(e) => {
              setNext(e.target.value);
              setState({ kind: 'idle' });
            }}
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm" error={mismatch ? 'Passwords do not match.' : null}>
          <input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => {
              setConfirm(e.target.value);
              setState({ kind: 'idle' });
            }}
            className={inputClass}
            placeholder="••••••••"
          />
        </Field>
      </div>
    </SettingsCard>
  );
}

/* ── Sessions ────────────────────────────────────────────── */

/** A user agent string, reduced to the one thing worth showing: the browser. */
function describeAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown device', os: '' };
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return { browser, os };
}

const sessionFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function SessionsSection({ currentToken }: { currentToken?: string }) {
  const { data: sessions, isPending, error } = useSessions();
  const revokeOthers = useRevokeOtherSessions();
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  const others = (sessions ?? []).filter((s) => s.token !== currentToken);
  const sorted = [...(sessions ?? [])].sort((a, b) => {
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <SettingsCard
      title="Signed-in devices"
      description="Every browser holding a live session on your account."
      footer={
        <>
          <SaveHint state={state} />
          <Button
            variant="secondary"
            disabled={others.length === 0}
            pending={revokeOthers.isPending}
            onClick={() => {
              setState({ kind: 'idle' });
              revokeOthers.mutate(undefined, {
                onSuccess: () => setState({ kind: 'saved' }),
                onError: (err) => setState({ kind: 'error', message: err.message }),
              });
            }}
          >
            Sign out other devices
          </Button>
        </>
      }
    >
      {isPending ? (
        <p className="py-2 text-sm text-stone-400">Loading devices…</p>
      ) : error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800">Could not list your devices</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">
            {error.message}. Reload the page to try again.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-brand-line">
          {sorted.slice(0, 6).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              current={session.token === currentToken}
            />
          ))}
        </ul>
      )}
      {!error && sorted.length > 6 && (
        <p className="mt-3 text-xs text-stone-400">
          +{sorted.length - 6} more. Signing out other devices clears all of them.
        </p>
      )}
    </SettingsCard>
  );
}

function SessionRow({ session, current }: { session: ActiveSession; current: boolean }) {
  const { browser, os } = describeAgent(session.userAgent);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${current ? 'bg-emerald-500' : 'bg-stone-300'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-ink">
          {browser}
          {os && <span className="font-normal text-stone-400"> · {os}</span>}
        </p>
        <p className="text-[11px] text-stone-400">
          Signed in {sessionFormatter.format(new Date(session.createdAt))}
        </p>
      </div>
      {current && (
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          This device
        </span>
      )}
    </li>
  );
}

/* ── Legal ───────────────────────────────────────────────── */

/**
 * The two documents every user is bound by. Kept in settings rather than a page
 * footer because the signed-in app has no footer, and a user looking for the
 * terms is looking in their account.
 */
export function LegalSection() {
  return (
    <SettingsCard
      title="Terms and privacy"
      description="The rules for using IKnoBall, and what we do with your data."
    >
      <ul className="divide-y divide-brand-line text-sm">
        {[
          { to: '/terms', label: 'Terms of Service' },
          { to: '/privacy', label: 'Privacy Policy' },
        ].map((item) => (
          <li key={item.to}>
            <Link
              to={item.to as never}
              className="flex items-center justify-between gap-3 py-3 font-semibold text-brand-ink transition-colors hover:text-brand-navy"
            >
              {item.label}
              <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
