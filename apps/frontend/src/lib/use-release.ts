import { useCallback, useMemo, useState } from 'react';
import { VERSION, releasesNewerThan, type Release } from '@iknoball/release';
import { useSession } from './use-auth';

/**
 * "What's new" state: which releases the signed-in user has not been shown yet.
 *
 * The version the user last dismissed is the only thing stored, so a release
 * that ships while they are away is still waiting for them next time, and one
 * they have already read never comes back. A browser with no stored version —
 * a first visit, or a cleared storage — counts as having seen nothing, so the
 * latest release notes still greet them once.
 *
 * localStorage can throw (Safari private mode, storage disabled). Losing the
 * record only means the notes show again, which is not worth failing a page
 * render over, so both reads and writes swallow the error.
 */

const SEEN_KEY = 'iknoball.release.seen';

function readSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeenVersion(version: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Storage unavailable: the notes will simply show again next visit.
  }
}

export function useWhatsNew(enabled: boolean): {
  open: boolean;
  releases: Release[];
  dismiss: () => void;
} {
  const { data: session, isPending } = useSession();
  const [seen, setSeen] = useState<string | null>(readSeenVersion);
  const [dismissed, setDismissed] = useState(false);

  const releases = useMemo(() => releasesNewerThan(seen), [seen]);

  const dismiss = useCallback(() => {
    writeSeenVersion(VERSION);
    setSeen(VERSION);
    setDismissed(true);
  }, []);

  return {
    // Signed-in only: someone who has not picked a team yet is mid-onboarding,
    // and release notes are not the first thing they need to read.
    open: enabled && !dismissed && !isPending && !!session?.user && releases.length > 0,
    releases,
    dismiss,
  };
}
