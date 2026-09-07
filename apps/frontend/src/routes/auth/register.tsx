import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSignUp, useDiscordSignIn } from '../../lib/use-auth';
import { useState, useEffect } from 'react';
import { FaDiscord } from 'react-icons/fa';

export const Route = createFileRoute('/auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const discordSignIn = useDiscordSignIn();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) setDiscordError(decodeURIComponent(oauthError));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    signUp.mutate(
      { name, email, password },
      {
        onError: (err) => setError(err.message),
        onSuccess: () => navigate({ to: '/auth/verify-email' }),
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
          <h1 className="text-xl font-semibold text-stone-900">Create account</h1>
          <p className="mt-1 text-sm text-stone-500">Start following NBA stats</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-stone-700">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-court-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-basketball-500 focus:outline-none focus:ring-1 focus:ring-basketball-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-court-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-basketball-500 focus:outline-none focus:ring-1 focus:ring-basketball-500"
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-court-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-basketball-500 focus:outline-none focus:ring-1 focus:ring-basketball-500"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={signUp.isPending}
            className="w-full rounded-md bg-basketball-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-basketball-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signUp.isPending ? 'Creating account…' : 'Create account'}
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
          <span>
            Already have an account?{' '}
            <Link
              to="/auth/login"
              className="font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
            >
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
