/**
 * The fonts the recap card draws with, and the fontconfig config that finds them.
 *
 * **Import this before `sharp`.** libvips renders SVG text through fontconfig, and
 * fontconfig reads `FONTCONFIG_FILE` once, on its first lookup. Setting it after sharp
 * has loaded is a silent no-op: the card still renders, in whatever face the system
 * happens to have, which on a slim image is nothing at all — every string becomes a row
 * of empty boxes. `recap-card.ts` therefore imports this module on its first line.
 *
 * The fonts ship with the bot (`apps/discord/assets/fonts`, copied into the image by
 * the Dockerfile) rather than being installed: the runner image has no font packages,
 * and the activity's own faces live in `apps/activity/public/fonts` as woff2, which
 * fontconfig cannot read. These are the same four faces as static TTF.
 *
 * The config is generated rather than committed because fontconfig wants absolute
 * paths and the checkout path is not known until runtime. It lands in the OS temp dir
 * and is rewritten on each boot; it is a dozen bytes, and a stale copy from a previous
 * image is harmless because the path inside it is recomputed first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `assets/fonts`, resolved from this file.
 *
 * `tsc` emits to `dist/`, so `__dirname` is either `src/scheduler` (when run from
 * source with bun) or `dist/scheduler` (in the image) — both are two levels under
 * `apps/discord`, which is where `assets` sits.
 */
export const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');

/** The family names the card asks for, which must match the TTFs' own name tables. */
export const FONT_FAMILIES = {
  regular: 'Poppins',
  medium: 'Poppins Medium',
  semibold: 'Poppins SemiBold',
  condensed: 'Oswald SemiBold',
} as const;

const CONF_PATH = join(tmpdir(), 'iknoball-recap-fonts.conf');
const CACHE_DIR = join(tmpdir(), 'iknoball-recap-fontconfig-cache');

/**
 * Point fontconfig at the shipped fonts, unless something already did.
 *
 * The override is deliberate: an operator debugging a render on a machine with its own
 * fonts keeps control, and the card degrades to the same fallback it would have had.
 */
function useShippedFonts(): void {
  if (process.env.FONTCONFIG_FILE) return;

  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      CONF_PATH,
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
        '<fontconfig>',
        `  <dir>${FONT_DIR}</dir>`,
        `  <cachedir>${CACHE_DIR}</cachedir>`,
        '</fontconfig>',
        '',
      ].join('\n'),
    );
    process.env.FONTCONFIG_FILE = CONF_PATH;
  } catch (error) {
    // A read-only temp dir is not worth crashing the scheduler over: the card is an
    // addition to the board post, and the post must go out regardless.
    process.env.FONTCONFIG_FILE = undefined;
    console.warn(
      `Could not write the recap fontconfig file at ${CONF_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

useShippedFonts();
