import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from '@tanstack/react-router';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * Renders a legal document from its Markdown source.
 *
 * The Markdown files in `src/content/legal` are the single source of truth: the
 * same text that ships in the app is the text to edit, so there is no
 * hand-maintained HTML copy to drift out of sync. Tables come from `remark-gfm`.
 *
 * Placeholders in the text (`{{CONTACT_EMAIL}}` and friends) are deliberate. While
 * any remain, the page shows a notice naming them, so an unfilled field cannot
 * quietly ship as if it were real contact details.
 */

type MarkdownComponentProps = { children?: ReactNode; node?: unknown };

function isInternalHref(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

/** A mail client should open in place, not in a new tab. */
function isMailto(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('mailto:');
}

export function LegalPage({ markdown }: { markdown: string }) {
  // Only warn about fields that are actually missing, and say which ones. A
  // generic "draft" banner would still be showing long after every field is
  // filled, which trains you to ignore it.
  const unfilled = [...new Set(markdown.match(/\{\{\s*([A-Z_]+)\s*\}\}/g) ?? [])].map((token) =>
    token.replace(/[{}\s]/g, ''),
  );

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-brand-line bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
      {unfilled.length > 0 && (
        <p
          role="status"
          className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong className="font-semibold">Not ready to publish.</strong> {unfilled.length}{' '}
          {unfilled.length === 1 ? 'field is' : 'fields are'} still unfilled:{' '}
          <code className="font-mono text-[13px]">{unfilled.join(', ')}</code>
        </p>
      )}

      <div className="text-[15px] text-stone-600">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }: MarkdownComponentProps) => (
              <h1 className="font-heading text-3xl font-black uppercase tracking-tight text-brand-ink sm:text-4xl">
                {children}
              </h1>
            ),
            h2: ({ children }: MarkdownComponentProps) => (
              <h2 className="mt-12 scroll-mt-24 border-t border-brand-line pt-6 font-heading text-xl font-bold uppercase tracking-wide text-brand-ink sm:text-2xl">
                {children}
              </h2>
            ),
            h3: ({ children }: MarkdownComponentProps) => (
              <h3 className="mt-8 scroll-mt-24 font-heading text-base font-bold uppercase tracking-wide text-brand-ink">
                {children}
              </h3>
            ),
            p: ({ children }: MarkdownComponentProps) => (
              <p className="mt-4 leading-relaxed">{children}</p>
            ),
            ul: ({ children }: MarkdownComponentProps) => (
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-stone-400">{children}</ul>
            ),
            ol: ({ children }: MarkdownComponentProps) => (
              <ol className="mt-4 list-decimal space-y-2 pl-5 marker:text-stone-400">{children}</ol>
            ),
            li: ({ children }: MarkdownComponentProps) => (
              <li className="leading-relaxed">{children}</li>
            ),
            strong: ({ children }: MarkdownComponentProps) => (
              <strong className="font-semibold text-brand-ink">{children}</strong>
            ),
            em: ({ children }: MarkdownComponentProps) => (
              <em className="italic text-stone-500">{children}</em>
            ),
            a: ({ href, children }: ComponentPropsWithoutRef<'a'>) =>
              isInternalHref(href) ? (
                <Link
                  to={href as never}
                  className="font-medium text-brand-navy underline decoration-brand-navy/30 underline-offset-2 hover:decoration-brand-navy"
                >
                  {children}
                </Link>
              ) : isMailto(href) ? (
                <a
                  href={href}
                  className="font-medium text-brand-navy underline decoration-brand-navy/30 underline-offset-2 hover:decoration-brand-navy"
                >
                  {children}
                </a>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-navy underline decoration-brand-navy/30 underline-offset-2 hover:decoration-brand-navy"
                >
                  {children}
                </a>
              ),
            blockquote: ({ children }: MarkdownComponentProps) => (
              <blockquote className="mt-6 border-l-4 border-basketball-400 bg-basketball-50 px-5 py-3 text-sm text-stone-700">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="mt-12 border-brand-line" />,
            code: ({ children }: MarkdownComponentProps) => (
              <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">
                {children}
              </code>
            ),
            table: ({ children }: MarkdownComponentProps) => (
              <div className="mt-5 overflow-x-auto rounded-lg border border-brand-line">
                <table className="w-full border-collapse text-left text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }: MarkdownComponentProps) => (
              <thead className="bg-court-50 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                {children}
              </thead>
            ),
            th: ({ children }: MarkdownComponentProps) => (
              <th className="border-b border-brand-line px-4 py-3 align-bottom">{children}</th>
            ),
            td: ({ children }: MarkdownComponentProps) => (
              <td className="border-b border-brand-line/70 px-4 py-3 align-top leading-relaxed last:border-0">
                {children}
              </td>
            ),
          }}
        >
          {markdown}
        </Markdown>
      </div>
    </article>
  );
}
