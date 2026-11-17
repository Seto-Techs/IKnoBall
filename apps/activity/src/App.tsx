import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ActivityError, connectDiscord } from './lib/discord';
import { fetchMe, messageOf, setBearer, type Me } from './lib/api';
import { TopBar } from './components/TopBar';
import { ProfileSheet } from './components/Profile';
import { Home } from './screens/Home';
import { Predictions } from './screens/Predictions';
import { Lebronnect } from './screens/Lebronnect';
import { Leaderboard } from './screens/Leaderboard';
import type { Screen } from './lib/nav';

/**
 * The shell: sign in, then one of four screens.
 *
 * There is no login screen and no session UI, because inside Discord the only
 * identity that exists is the account that launched the activity. The SDK's code
 * is spent on the backend, which resolves it to an existing IKnoBall account and
 * mints a real session; everything after that is an ordinary authenticated API
 * call carrying `Authorization: Bearer`.
 */
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [failure, setFailure] = useState<{ message: string; unlinked: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const token = await acquireToken();
        setBearer(token);
        const profile = await fetchMe();
        if (alive) setMe(profile);
      } catch (error) {
        if (!alive) return;
        setFailure({
          message: messageOf(error),
          unlinked: error instanceof ActivityError && error.status === 403,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (failure) return <BootError message={failure.message} unlinked={failure.unlinked} />;
  if (!me) return <Booting />;

  return (
    <div className="relative flex h-full flex-col bg-stone-200">
      <TopBar
        me={me}
        screen={screen}
        onNavigate={setScreen}
        onProfile={() => setProfileOpen(true)}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {screen === 'home' && (
          <div className="h-full overflow-y-auto overscroll-contain">
            <Home onOpen={setScreen} />
          </div>
        )}
        {screen === 'predictions' && <Predictions />}
        {screen === 'lebronnect' && <Lebronnect me={me} />}
        {screen === 'leaderboard' && <Leaderboard me={me} />}
      </main>

      {profileOpen && (
        <ProfileSheet
          me={me}
          onClose={() => setProfileOpen(false)}
          onSaved={(next) => setMe(next)}
        />
      )}
    </div>
  );
}

/**
 * The bearer token for this session.
 *
 * Inside Discord that means the SDK handshake. In development there is no
 * Discord client to launch the app from, so a token can be handed in with
 * `?token=` (or left in storage from a previous run) and the app drives itself
 * like any other authenticated page. It is gated on `import.meta.env.DEV`: a
 * production build always goes through Discord, so the shortcut cannot become a
 * way in.
 */
async function acquireToken(): Promise<string> {
  if (import.meta.env.DEV) {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    const stored = window.localStorage.getItem(DEV_TOKEN_KEY);
    const dev = fromUrl ?? stored;
    if (dev) {
      try {
        window.localStorage.setItem(DEV_TOKEN_KEY, dev);
      } catch {
        // Storage unavailable: the token still works for this page load.
      }
      return dev;
    }
  }

  const session = await connectDiscord();
  return session.token;
}

const DEV_TOKEN_KEY = 'iknoball.activity.dev-token';

function Booting() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-stone-200 px-6 text-center">
      <img src="/brand/iknoball-mark.svg" alt="" className="h-14 w-14" />
      <p className="flex items-center gap-2 text-[15px] font-medium text-stone-600" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Signing you in with Discord…
      </p>
      <p className="max-w-xs text-[13px] leading-relaxed text-stone-500">
        IKnoBall uses the Discord account you launched this from. No password, no forms.
      </p>
    </div>
  );
}

function BootError({ message, unlinked }: { message: string; unlinked: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-200 px-6 text-center">
      <img src="/brand/iknoball-mark.svg" alt="" className="h-12 w-12 opacity-60" />
      <div className="flex max-w-sm items-start gap-2 rounded-xl border border-brand-line bg-white p-4 text-left shadow-sm">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-red" aria-hidden />
        <div>
          <p className="font-heading text-[17px] font-semibold uppercase tracking-wide text-brand-ink">
            {unlinked ? 'Link your account first' : 'Could not open the activity'}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-stone-600">{message}</p>
          {unlinked && (
            <p className="mt-2 rounded-lg bg-brand-cream px-3 py-2 text-[13px] font-semibold text-brand-navyDark">
              In Discord, type <span className="font-mono">/link</span> in any channel, follow the
              prompt, then launch the activity again.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-brand-navy px-4 py-2 font-heading text-[13px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-navyDark"
      >
        Try again
      </button>
    </div>
  );
}
