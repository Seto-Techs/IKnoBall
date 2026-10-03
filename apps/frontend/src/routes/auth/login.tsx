import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSignIn, AuthError, useDiscordSignIn, useSession } from '../../lib/use-auth';
import { useState, useEffect } from 'react';
import { FaDiscord } from 'react-icons/fa';

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const signIn = useSignIn();
  const discordSignIn = useDiscordSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const { data: session, isPending: sessionLoading } = useSession();

  useEffect(() => {
    if (sessionLoading) return;
    if (session?.user) {
      navigate({
        to: session.user.favoriteTeam ? '/dashboard' : '/onboarding',
        search: session.user.favoriteTeam ? {} : undefined,
      } as never);
    }
  }, [session, sessionLoading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) setDiscordError(decodeURIComponent(oauthError));
  }, []);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);

    signIn.mutate(
      { email, password },
      {
        onError: (err) => {
          setError(err.message);
          setErrorCode(err instanceof AuthError ? err.code : null);
        },
        onSuccess: (data) =>
          navigate({ to: data?.user?.favoriteTeam ? '/dashboard' : '/onboarding' }),
      },
    );
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-brand-line bg-white shadow-xl">
        <div className="bg-brand-navyDark px-8 py-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-red font-heading text-xl font-black text-white shadow-md">
            IK
          </div>
          <h1 className="font-heading text-2xl font-black uppercase tracking-wide text-white">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-white/70">Welcome back to IKnoBall</p>
        </div>

        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-brand-ink">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-line bg-white px-3 py-2.5 text-sm text-brand-ink placeholder-stone-400 outline-none transition-colors focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-brand-ink">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-line bg-white px-3 py-2.5 text-sm text-brand-ink placeholder-stone-400 outline-none transition-colors focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                placeholder="••••••••"
              />
            </div>

            {error && errorCode === 'EMAIL_NOT_VERIFIED' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                <p className="font-medium text-amber-800">Email not verified</p>
                <p className="mt-1 text-amber-700">
                  A new verification link has been sent to your email. Check your inbox or{' '}
                  <Link
                    to="/auth/verify-email"
                    search={{ email }}
                    className="font-semibold underline underline-offset-2 hover:text-amber-900"
                  >
                    resend it
                  </Link>
                  .
                </p>
              </div>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={signIn.isPending}
              className="w-full rounded-full bg-brand-navyDark px-4 py-3 text-sm font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-brand-line" />
            <span className="mx-3 text-xs font-medium uppercase tracking-wider text-stone-400">
              or
            </span>
            <div className="flex-grow border-t border-brand-line" />
          </div>

          {discordError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {discordError}
            </p>
          )}

          <button
            type="button"
            disabled={discordSignIn.isPending}
            onClick={() => {
              setDiscordError(null);
              discordSignIn.mutate(undefined, {
                onError: (err) => setDiscordError(err.message),
              });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#5865F2] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#4752C4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaDiscord className="h-4 w-4 shrink-0" />
            {discordSignIn.isPending ? 'Redirecting…' : 'Continue with Discord'}
          </button>

          <div className="mt-5 flex flex-col items-center gap-2 text-sm text-stone-500">
            <Link
              to="/auth/forgot-password"
              className="text-stone-600 underline-offset-2 hover:text-brand-navy hover:underline"
            >
              Forgot your password?
            </Link>
            <span>
              No account?{' '}
              <Link
                to="/auth/register"
                className="font-semibold text-brand-navy underline-offset-2 hover:text-brand-red hover:underline"
              >
                Create one
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
