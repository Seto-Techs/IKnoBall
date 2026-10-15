/**
 * Nav type for every header. It follows the wordmark: condensed (Oswald),
 * uppercase, wide tracking, and the active tab underlines in the logo's seam
 * orange. The three headers — root shell, landing, dashboard — all call this
 * so the treatment cannot drift between them; `tone` only flips it for a dark
 * surface.
 */

export type NavTone = 'light' | 'dark';

const BASE =
  'font-heading text-[15px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const RING: Record<NavTone, string> = {
  light: 'focus-visible:ring-brand-navy',
  dark: 'focus-visible:ring-white',
};

const IDLE: Record<NavTone, string> = {
  light: 'text-stone-500 hover:text-brand-navy',
  dark: 'text-white/60 hover:text-white',
};

const ACTIVE: Record<NavTone, string> = {
  light: 'text-brand-navy underline decoration-brand-orange decoration-2 underline-offset-[10px]',
  dark: 'text-white underline decoration-brand-orange decoration-2 underline-offset-[10px]',
};

/**
 * `extra` appends layout classes for call sites that need them (the dashboard's
 * mobile row). It must not restate colour or decoration — those come from here.
 */
export function navLinkClass(on: boolean, tone: NavTone = 'light', extra = ''): string {
  return `${BASE} ${RING[tone]} ${on ? ACTIVE[tone] : IDLE[tone]}${extra ? ` ${extra}` : ''}`;
}
