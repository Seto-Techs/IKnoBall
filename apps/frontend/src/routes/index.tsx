import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import LandingPage from '../components/landing/LandingPage';
import { useSession } from '../lib/use-auth';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading } = useSession();

  // Signed-in users skip the marketing page and land in the app.
  useEffect(() => {
    if (sessionLoading) return;
    if (session?.user) {
      navigate({
        to: session.user.favoriteTeam ? '/dashboard' : '/onboarding',
        search: session.user.favoriteTeam ? {} : undefined,
      } as never);
    }
  }, [session, sessionLoading, navigate]);

  return <LandingPage />;
}
