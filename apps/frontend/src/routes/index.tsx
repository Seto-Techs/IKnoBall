import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { hasSelectedTeam } from '../lib/team';
import { useEffect } from 'react';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (hasSelectedTeam()) {
      navigate({ to: '/dashboard' });
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-basketball-500 shadow-sm">
        <span className="text-2xl font-bold text-white">IK</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-stone-900">
        Welcome to IKnoBall
      </h1>
      <p className="max-w-md text-center text-stone-500">
        Basketball stats, schedules, and box scores — all in one place.
      </p>
    </div>
  );
}
