import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSignIn, AuthError, useDiscordSignIn } from '../../lib/use-auth';
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
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-court-200 bg-white p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-basketball-500 text-base font-bold text-white shadow-sm">
            IK
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Sign in</h1>
          <p className="mt-1 text-sm text-stone-500">Welcome back to IKnoBall</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-court-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 outline-none transition-colors focus:border-basketball-400 focus:ring-1 focus:ring-basketball-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-stone-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-court-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 outline-none transition-colors focus:border-basketball-400 focus:ring-1 focus:ring-basketball-400"
              placeholder="••••••••"
            />
          </div>

          {error && errorCode === 'EMAIL_NOT_VERIFIED' ? (
            <div className="rounded-md bg-amber-50 px-3 py-3 text-sm">
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
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={signIn.isPending}
            className="w-full rounded-md bg-basketball-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-basketball-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="relative my-6 flex items-center">
          <div className="flex-grow border-t border-court-200" />
          <span className="mx-3 text-xs font-medium uppercase tracking-wider text-stone-400">
            or
          </span>
          <div className="flex-grow border-t border-court-200" />
        </div>

        {discordError && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{discordError}</p>
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
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752C4] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaDiscord className="h-4 w-4 shrink-0" />
          {discordSignIn.isPending ? 'Redirecting…' : 'Continue with Discord'}
        </button>

        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-stone-500">
          <Link
            to="/auth/forgot-password"
            className="text-stone-600 underline-offset-2 hover:text-basketball-600 hover:underline"
          >
            Forgot your password?
          </Link>
          <span>
            No account?{' '}
            <Link
              to="/auth/register"
              className="font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
            >
              Create one
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
