import { createFileRoute, Link } from '@tanstack/react-router';
import { useSignUp } from '../../lib/use-auth';
import { useState } from 'react';
export const Route = createFileRoute('/auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const signUp = useSignUp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  if (registeredEmail) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border border-court-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-arena-100">
            <svg
              className="h-6 w-6 text-arena-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            We sent a verification link to{' '}
            <span className="font-medium text-stone-700">{registeredEmail}</span>. Click the link to
            verify, then sign in.
          </p>
          <div className="mt-8 space-y-3">
            <Link
              to="/auth/login"
              className="inline-block text-sm font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    signUp.mutate(
      { name, email, password },
      {
        onError: (err) => setError(err.message),
        onSuccess: () => setRegisteredEmail(email),
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
