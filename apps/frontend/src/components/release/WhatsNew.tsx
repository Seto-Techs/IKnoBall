import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import { Sparkles, X } from 'lucide-react';
import type { Release } from '@iknoball/release';
import { useWhatsNew } from '../../lib/use-release';
import { ReleaseNotes } from './ReleaseNotes';

/**
 * Greets a signed-in player with the notes for the release they just landed on.
 *
 * This is the point of versioning here: the app tells you what changed instead
 * of expecting you to read a changelog somewhere else. It is mounted once by the
 * root shell, so it opens on whatever page you land on, and it shows the newest
 * release with a link to the full history rather than replaying every note.
 *
 * The modal follows the same pattern as the game popup — portal to the body,
 * scroll lock, focus moved in and returned on close, Escape to dismiss, Tab kept
 * inside the card — so the two dialogs behave identically.
 */
export function WhatsNew({ enabled }: { enabled: boolean }) {
  const { open, releases, dismiss } = useWhatsNew(enabled);
  if (!open) return null;
  return <WhatsNewDialog releases={releases} onClose={dismiss} />;
}

function WhatsNewDialog({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  const release = releases[0]!;
  const older = releases.length - 1;

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  // Animate in on the frame after mount, so the transition has a start value.
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => closeRef.current?.focus(), 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus();
      }
    };
  }, [close]);

  const content = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Dismiss release notes"
        onClick={close}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backdropFilter: visible ? 'blur(2px)' : 'blur(0px)' }}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className={`relative flex max-h-[85dvh] w-full flex-col overflow-hidden border border-brand-line bg-white shadow-xl transition-all duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none max-sm:rounded-t-2xl sm:max-w-[480px] sm:rounded-lg ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 sm:translate-y-2'
        }`}
      >
        <header className="relative shrink-0 border-b border-brand-line bg-court-50 px-5 pb-4 pt-5">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition hover:bg-white hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-basketball-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            What&rsquo;s new
          </p>
          <h2
            id="whats-new-title"
            className="mt-1 pr-8 font-heading text-xl font-bold uppercase tracking-wide text-brand-ink"
          >
            v{release.version}
          </h2>
          {older > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              {older} more {older === 1 ? 'release' : 'releases'} in the changelog.
            </p>
          )}
        </header>

        <div className="overflow-y-auto px-5 py-4">
          <ReleaseNotes release={release} heading={false} />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-brand-line bg-stone-50/70 px-5 py-3">
          <Link
            to="/changelog"
            onClick={close}
            className="rounded-md text-sm font-semibold text-brand-navy transition-colors hover:text-basketball-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            See all updates
          </Link>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-basketball-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-basketball-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
