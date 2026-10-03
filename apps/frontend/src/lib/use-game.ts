import { useGame } from './api';

/**
 * Resolves a single game by its id via the dedicated `/games/:id` endpoint, so
 * any game on the schedule opens regardless of how far it is from today.
 */
export function useGameById(gameId: string | undefined) {
  const { data, isLoading } = useGame(gameId);
  return { game: data ?? null, isLoading };
}
