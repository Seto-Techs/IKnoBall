import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { authClient } from '../../lib/auth';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/auth/verify')({
  component: VerifyPage,
  validateSearch: (search: Record<string, string | undefined>) => ({
    token: search.token ?? '',
  }),
});

function VerifyPage() {
  const { token } = useSearch({ from: '/auth/verify' });
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    authClient
      .verifyEmail({ query: { token } })
      .then(({ error: err }) => {
        if (err) {
          setStatus('error');
          setMessage(err.message ?? err.code ?? 'Verification failed');
        } else {
          setStatus('success');
          setMessage('Email verified successfully!');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Try again.');
      });
  }, [token]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-court-200 bg-white p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="mx-auto mb-4 h-9 w-9 animate-pulse rounded-full bg-arena-200" />
            <h1 className="text-xl font-semibold text-stone-900">Verifying…</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-base font-bold text-white">
              ✓
            </div>
            <h1 className="text-xl font-semibold text-stone-900">{message}</h1>
            <Link
              to="/auth/login"
              className="mt-6 inline-block text-sm font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
            >
              Sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-base font-bold text-white">
              !
            </div>
            <h1 className="text-xl font-semibold text-stone-900">Verification failed</h1>
            <p className="mt-2 text-sm text-stone-500">{message}</p>
            <Link
              to="/auth/login"
              className="mt-6 inline-block text-sm font-medium text-basketball-600 underline-offset-2 hover:text-basketball-700 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
