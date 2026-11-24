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
import sharp, { type Sharp } from 'sharp';

/** Long enough for a slow CDN, short enough that a hung one costs one card. */
const IMAGE_TIMEOUT_MS = 5_000;

/** Headshots are drawn at most 54px across; anything above this is wasted bytes. */
const MAX_EDGE = 256;

/**
 * How a picture is framed before it goes into the card's circle.
 *
 * The two sources need opposite treatment, which is why this is not one resize.
 */
export type ImageShape =
  /** A Discord avatar: square already, and the face is what the reader looks at. */
  | 'avatar'
  /** An NBA headshot: a wide cutout with the subject framed to one side of centre. */
  | 'headshot';

/**
 * Where the subject sits in an NBA headshot, as fractions of the file.
 *
 * Measured across a sample of the CDN's `1040x760` cutouts (LeBron, Dončić, Curry,
 * Tatum): the head is centred at 0.49 of the width — *not* 0.5 — the crown touches the
 * top edge, the chin lands around 0.6 of the height, and the shoulders and jersey flare
 * out below that. Every file is framed the same way, so these are constants and not
 * detection.
 */
const HEAD_CENTRE_X = 0.49;

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
export async function fetchImage(
  url: string | null,
  shape: ImageShape = 'avatar',
): Promise<Buffer | null> {
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return await normalise(sharp(bytes), shape);
  } catch {
    // Timeout, DNS, a 404 for a traded player, or bytes that are not an image. All of
    // them mean the same thing to the card: draw initials.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch many images at once, preserving order. */
export async function fetchImages(
  urls: (string | null)[],
  shape: ImageShape = 'avatar',
): Promise<(Buffer | null)[]> {
  return Promise.all(urls.map((url) => fetchImage(url, shape)));
}

/**
 * Square PNG at `MAX_EDGE`.
 *
 * An avatar is cover-cropped on its salient region: Discord avatars are already framed
 * on the person, so sharp's saliency is the right guess.
 *
 * A headshot is not. `position: 'attention'` re-centres on the cutout's salient region,
 * which for these files is the jersey, and the result measured 0.67 of the way across
 * the square — so the card's circle sliced the left of the face off. Cover-cropping on
 * the centre is no better: the head is at 0.49, not 0.5, so it drifts the same way. So
 * the square is taken from the frame deliberately: centred on the measured face, full
 * height, starting at the top edge so the crown is never clipped and the shoulders stay
 * in frame.
 */
async function normalise(image: Sharp, shape: ImageShape): Promise<Buffer> {
  if (shape === 'avatar') {
    return image
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
  }

  const { width = 0, height = 0 } = await image.metadata();
  // The square is the frame's full height, which is what keeps the jersey in: anything
  // tighter is all face and collar. The frame is wider than it is tall, so the width it
  // leaves over is the empty margin either side of the cutout.
  const side = Math.min(height, width);
  const left = Math.max(0, Math.round(width * HEAD_CENTRE_X - side / 2));

  return image
    .extract({ left, top: 0, width: side, height: side })
    .resize(MAX_EDGE, MAX_EDGE)
    .png()
    .toBuffer();
}
