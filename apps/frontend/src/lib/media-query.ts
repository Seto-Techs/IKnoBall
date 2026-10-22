import { useSyncExternalStore } from 'react';

/**
 * The width at which the dashboard grows its side rails, which hold the
 * standings and both leaderboards. Below it those panels exist only on
 * /rankings, so anything that duplicates them keys off this same query.
 */
export const RAIL_LAYOUT_QUERY = '(min-width: 1280px)';

function subscribe(query: string, onChange: () => void): () => void {
  const list = window.matchMedia(query);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Whether the viewport currently matches a media query, kept live on resize. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
  );
}
