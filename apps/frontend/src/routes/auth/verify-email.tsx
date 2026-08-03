import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { authClient } from '../../lib/auth';
import { useState } from 'react';

export const Route = createFileRoute('/auth/verify-email')({
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, string | undefined>) => ({
    email: search.email ?? '',
  }),
});

function VerifyEmailPage() {
  const { email } = useSearch({ from: '/auth/verify-email' });
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');

  const handleResend = async () => {
    if (!email) return;
    setResendStatus('loading');
    setResendError('');

    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email,
      });
      if (err) {
        setResendStatus('error');
        setResendError(err.message ?? 'Failed to resend. Try again.');
      } else {
        setResendStatus('sent');
      }
    } catch {
      setResendStatus('error');
      setResendError('Something went wrong. Try again.');
    }
  };

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
          <span className="font-medium text-stone-700">{email || 'your email'}</span>. Click the
          link to verify your account, then sign in.
        </p>

        <div className="mt-8 space-y-3">
          {resendStatus === 'sent' && (
            <p className="text-sm font-medium text-green-600">Verification email resent!</p>
          )}

          {resendStatus === 'error' && (
            <p className="text-sm text-red-600" role="alert">
              {resendError}
            </p>
          )}

          <button
            onClick={handleResend}
            disabled={resendStatus === 'loading' || !email}
            className="w-full rounded-md border border-court-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-court-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resendStatus === 'loading' ? 'Sending…' : 'Resend verification email'}
          </button>

          <Link
            to="/auth/login"
            className="block text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
