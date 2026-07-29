import { createFileRoute, Link } from '@tanstack/react-router';
import { authClient } from '../../lib/auth';
import { useState } from 'react';

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await authClient.forgetPassword({ email });

    setLoading(false);

    if (err) {
      setError(err.message ?? err.code ?? 'Something went wrong');
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border border-court-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-arena-500 text-base font-bold text-white">
            ✓
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Check your email</h1>
          <p className="mt-2 text-sm text-stone-500">
            If an account with <span className="font-medium text-stone-700">{email}</span> exists,
            you'll receive a password reset link.
          </p>
          <Link
            to="/auth/login"
            className="mt-6 inline-block text-sm font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-court-200 bg-white p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-stone-900">Reset password</h1>
          <p className="mt-1 text-sm text-stone-500">
            Enter your email and we'll send you a reset link.
          </p>
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

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-basketball-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-basketball-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-500">
          <Link
            to="/auth/login"
            className="font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
