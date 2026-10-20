import { ArrowUpRight, Globe2, Heart, MapPin } from 'lucide-react';

/**
 * Support / donation page.
 *
 * Two rails rather than one link: Saweria settles in rupiah with the local
 * methods most Indonesian supporters already have, Sociabuzz takes cards and
 * PayPal for everyone else. Both go straight to the same project account.
 *
 * The links are plain anchors with `target="_blank"`: they leave the app, so
 * they must not go through the router.
 */

type DonationLinkProps = {
  href: string;
  name: string;
  audience: string;
  methods: string;
  icon: typeof MapPin;
  primary?: boolean;
};

function DonationLink({ href, name, audience, methods, icon: Icon, primary }: DonationLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? 'group flex flex-col gap-3 rounded-xl border border-basketball-500 bg-basketball-500 p-5 text-white transition-colors hover:border-basketball-600 hover:bg-basketball-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2'
          : 'group flex flex-col gap-3 rounded-xl border border-brand-line bg-white p-5 text-brand-ink transition-colors hover:border-brand-navy hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2'
      }
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-heading text-lg font-bold uppercase tracking-wide">{name}</span>
        <ArrowUpRight
          className={`h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
            primary ? 'text-white/80' : 'text-stone-400'
          }`}
          aria-hidden="true"
        />
      </span>

      <span className="flex flex-col gap-1">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
            primary ? 'text-white/80' : 'text-stone-500'
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {audience}
        </span>
        <span className={`text-sm ${primary ? 'text-white/90' : 'text-stone-600'}`}>{methods}</span>
      </span>
    </a>
  );
}

export function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <article className="rounded-2xl border border-brand-line bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-basketball-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-basketball-600">
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          Support the project
        </span>

        <h1 className="mt-5 font-heading text-3xl font-black uppercase tracking-tight text-brand-ink sm:text-4xl">
          Keep IKnoBall on the court
        </h1>

        <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-stone-600">
          <p>
            IKnoBall is built and paid for by one person. No ads, no subscription, no investors —
            just a stats app a basketball fan wanted to exist, so he made it.
          </p>
          <p>
            Your support covers the boring stuff that keeps it live: hosting and the database, the
            stats API behind every box score, and the late nights spent fixing whatever broke during
            the fourth quarter. Every bit of it goes back into the app.
          </p>
          <p className="font-semibold text-brand-ink">
            Pick whichever rail suits where you are watching from:
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <DonationLink
            href="https://saweria.co/setotechs"
            name="Saweria"
            audience="Indonesia"
            methods="QRIS, e-wallets and bank transfer, in rupiah."
            icon={MapPin}
            primary
          />
          <DonationLink
            href="https://sociabuzz.com/setotechs"
            name="Sociabuzz"
            audience="Everywhere else"
            methods="Cards, PayPal, Apple Pay and Google Pay, in your currency."
            icon={Globe2}
          />
        </div>

        <p className="mt-8 border-t border-brand-line pt-6 text-xs leading-relaxed text-stone-500">
          Donations are optional and unlock nothing — everyone gets the same app, the same
          leaderboards and the same predictions. If you would rather just keep playing, that is
          support enough.
        </p>
      </article>
    </div>
  );
}
