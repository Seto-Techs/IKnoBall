import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Heart } from 'lucide-react';
import { Logo } from '../brand/Logo';

/**
 * Slim footer for every route that does not ship its own.
 *
 * The landing page has the full marketing footer, and onboarding is a focused
 * flow with no exit links, so both opt out. Everything else — the dashboard,
 * the legal pages, the auth screens — renders this from the root shell, which
 * keeps the support page one click away wherever you are.
 *
 * It is never on screen until you reach the bottom: the shell gives the main
 * column a viewport of its own height, so the footer always starts below the
 * fold, and this fades it in once it scrolls into view. Keyboard users get it
 * straight away through `focus-within`, since tabbing into a transparent link
 * would otherwise show a focus ring on nothing.
 */

const linkClass =
  'rounded-md transition-colors hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2';

export function SiteFooter() {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer
      ref={ref}
      className={`border-t border-brand-line bg-white transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        revealed
          ? 'translate-y-0 opacity-100'
          : 'translate-y-2 opacity-0 focus-within:translate-y-0 focus-within:opacity-100'
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Logo className="h-5 w-auto text-brand-navy" />
          <span>© 2026 IKnoBall</span>
          <span className="text-stone-400">Not affiliated with, or endorsed by, the NBA.</span>
        </div>

        <nav aria-label="Footer" className="flex items-center gap-5">
          <Link
            to="/support"
            className="inline-flex items-center gap-1.5 rounded-md font-semibold text-brand-navy transition-colors hover:text-basketball-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
            Support us
          </Link>
          <Link to="/terms" className={linkClass}>
            Terms
          </Link>
          <Link to="/privacy" className={linkClass}>
            Privacy
          </Link>
          <Link to="/changelog" className={linkClass}>
            Changelog
          </Link>
        </nav>
      </div>
    </footer>
  );
}
