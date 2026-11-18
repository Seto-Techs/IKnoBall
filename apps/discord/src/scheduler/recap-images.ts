/**
 * The pictures on the recap card: Discord avatars and NBA headshots.
 *
 * Both are fetched over the public internet, which is the only part of the card that
 * can be slow or wrong. So this module never throws: a picture that does not arrive is
 * `null`, and the card draws initials in its place. A missing avatar must not cost a
 * guild its leaderboard.
 *
 * Headshots come from the same CDN the site and the Activity use, at the same
 * `1040x760` path — the small `260x190` variants are cropped tighter and lose the top
 * of the head at the size the card draws.
 *
 * Fetches are bounded by a timeout and run together, because the card is drawn once per
 * guild per day and four sequential NBA CDN round trips would be four chances to stall
 * the tick.
 */
import sharp from 'sharp';

/** Long enough for a slow CDN, short enough that a hung one costs one card. */
const IMAGE_TIMEOUT_MS = 5_000;

/** Headshots are drawn at most 54px across; anything above this is wasted bytes. */
const MAX_EDGE = 256;

/** The NBA headshot for a player, by the id the graph knows them by. */
export function headshotUrl(externalId: string): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${externalId}.png`;
}

/**
 * Fetch one image and normalise it to a small PNG.
 *
 * Normalising matters for avatars: Discord serves them as webp or animated gif, and the
 * card embeds them as `data:image/png`. Sharp reads all three and the resize keeps the
 * base64 small enough that the SVG stays a reasonable string.
 */
export async function fetchImage(url: string | null): Promise<Buffer | null> {
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return await sharp(bytes)
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
  } catch {
    // Timeout, DNS, a 404 for a traded player, or bytes that are not an image. All of
    // them mean the same thing to the card: draw initials.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch many images at once, preserving order. */
export async function fetchImages(urls: (string | null)[]): Promise<(Buffer | null)[]> {
  return Promise.all(urls.map((url) => fetchImage(url)));
}
