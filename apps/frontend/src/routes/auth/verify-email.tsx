import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useSignIn } from '../../lib/use-auth';

export const Route = createFileRoute('/auth/verify-email')({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const signIn = useSignIn();

  const handleVerified = () => {
    // Fake-verify: sign in with mock credentials, then forward
    signIn.mutate(
      { email: 'admin@iknoball.dev', password: '12345678' },
      {
        onSuccess: (data) =>
          navigate({ to: data?.user?.favoriteTeam ? '/dashboard' : '/onboarding' }),
      },
    );
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
          We sent a verification link to your email. Click the link to verify your account, then
          come back here.
        </p>

        <div className="mt-8 space-y-3">
          <button
            onClick={handleVerified}
            disabled={signIn.isPending}
            className="w-full rounded-md bg-basketball-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signIn.isPending ? 'Signing in…' : "I've verified — continue"}
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
