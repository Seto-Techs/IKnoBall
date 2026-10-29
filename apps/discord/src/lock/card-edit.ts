import type { CardPayload } from '../cards/card-payload';

/**
 * The two card edits the bot makes after a card is posted: the tip-off lock
 * (DISC-05) and the result edit (DISC-11).
 *
 * Both are expressed as transforms of the payload `cardPayload` already builds,
 * for two reasons. The card's own shape stays in one place (`cards/`), and the
 * edit is a pure function of (payload, result) — so a unit test can pin the exact
 * JSON Discord receives without a client, a database, or a clock.
 *
 * The edits are deliberately additive. Nothing is removed from the card: a lock
 * keeps the tip-off line and the records, and a result keeps the buttons in a
 * disabled state rather than deleting them (DISC-11: "never delete the card").
 */

/** Appended the moment the game reaches tip-off. */
export const LOCKED_LINE = '🔒 **Locked at tip-off**';

/**
 * Appended when the game is final.
 *
 * It points at the `/picks` command rather than at a URL: the card is shared, so
 * it cannot show what *this* reader picked, and the durable per-user answer is
 * the slash command (DISC-15). There is no web route to link to.
 */
export const SETTLED_LINE = 'Settled · `/picks` shows what you got';

/** What a final game finished on. Both scores are non-null when this exists. */
export interface FinalScore {
  awayTricode: string;
  homeTricode: string;
  awayScore: number;
  homeScore: number;
}

/** `schedule_games.gameStatus`: 1 scheduled, 2 live, 3 final (the worker's settlement). */
export const STATUS_FINAL = 3;

/**
 * The card state a look is decided from.
 *
 * Deliberately the subset of a `discord_cards` + `schedule_games` row that changes
 * the render, with the tricodes already resolved to what the card will print. A
 * `CardRow` satisfies it structurally, so the repository passes rows straight in.
 */
export interface CardState {
  gameStatus: number;
  gameDateTimeUTC: Date | null;
  homeScore: number | null;
  awayScore: number | null;
  lockedAt: Date | null;
  settledAt: Date | null;
  homeTricode: string;
  awayTricode: string;
}

/** How a card should look right now. */
export type CardLook = 'open' | 'locked' | 'settled';

/**
 * Which of the three looks a card has.
 *
 * Decided from the *game*, not only from the stamps, so a rebuild of a shared
 * message always renders the truth: a card whose game is final shows the score
 * even if the settlement sweep has not stamped it yet, and a card past tip-off is
 * frozen even if the lock sweep has not reached it. That is what makes two sweeps
 * editing the same message in the same minute harmless — they compute the same
 * payload — and it is why a stamp can be written after the edit without the card
 * flickering back.
 *
 * `settledAt` alone is not enough to call a card settled: a row can only be stamped
 * once it has been edited, and the score is what the edit needs.
 */
export function cardLook(card: CardState, now: Date): CardLook {
  if (isFinal(card)) return 'settled';
  if (card.lockedAt !== null) return 'locked';

  const tipOff = card.gameDateTimeUTC?.getTime();
  if (tipOff !== undefined && tipOff <= now.getTime()) return 'locked';

  return 'open';
}

/** Final *and* with a result to print: a final row with no score is not a result. */
function isFinal(card: CardState): boolean {
  return card.gameStatus === STATUS_FINAL && card.homeScore !== null && card.awayScore !== null;
}

/** The card as it should look at `now`: open, locked, or settled with the score. */
export function renderCard(payload: CardPayload, card: CardState, now: Date): CardPayload {
  switch (cardLook(card, now)) {
    case 'settled':
      return settledCard(payload, finalScore(card));
    case 'locked':
      return lockedCard(payload);
    default:
      return payload;
  }
}

/** The score line's sides, taken from the resolved tricodes the card prints. */
export function finalScore(card: CardState): FinalScore {
  return {
    awayTricode: card.awayTricode,
    homeTricode: card.homeTricode,
    awayScore: card.awayScore ?? 0,
    homeScore: card.homeScore ?? 0,
  };
}

/** The card as it looks from tip-off until the game is final. */
export function lockedCard(payload: CardPayload): CardPayload {
  return withDescription(disablePickButtons(payload), LOCKED_LINE);
}

/** The card as it looks once the game is final: score, settled, no picks. */
export function settledCard(payload: CardPayload, score: FinalScore): CardPayload {
  return withDescription(disablePickButtons(payload), finalLine(score), SETTLED_LINE);
}

/** `**Final** MEM 102 – 108 DAL` — away first, the same order as the title. */
export function finalLine(score: FinalScore): string {
  return `**Final** ${score.awayTricode} ${score.awayScore} – ${score.homeScore} ${score.homeTricode}`;
}

/**
 * Turn off every button that does something, leave the ones that navigate.
 *
 * `disabled` is a property of the message component, so it applies to everyone
 * reading the card — which is exactly what a lock is. The "Open on web" button is
 * a link: Discord has no disabled state for it, and it stays useful.
 */
export function disablePickButtons(payload: CardPayload): CardPayload {
  return {
    ...payload,
    components: payload.components.map((row) => ({
      ...row,
      components: row.components.map((component) =>
        'custom_id' in component ? { ...component, disabled: true } : component,
      ),
    })),
  };
}

/** Append lines to the first embed's description, keeping what is already there. */
function withDescription(payload: CardPayload, ...lines: string[]): CardPayload {
  const [embed, ...rest] = payload.embeds;
  if (!embed) return payload;

  const description = [embed.description?.trim(), ...lines]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  return { ...payload, embeds: [{ ...embed, description }, ...rest] };
}

/** Whether an edit failed in a way that will never succeed on a retry. */
export type EditFailure = 'dead' | 'transient';

/**
 * Discord error codes that mean "this message can never be edited again".
 *
 * 10003 unknown channel, 10004 unknown guild, 10008 unknown message, 50001
 * missing access, 50007 cannot send messages to this user, 50013 missing
 * permissions. Every one of them is a property of the card's destination, not of
 * the moment, so retrying is pointless: the card is dead (DISC-05).
 */
const DEAD_CODES = new Set([10003, 10004, 10008, 50001, 50007, 50013]);

/**
 * Sort an edit failure into "stop trying this card" and "try again later".
 *
 * 403 and 404 are dead regardless of the code: a permission the bot no longer
 * has, or a route whose target is gone. Everything else — 5xx, 429, a socket
 * reset, a timeout — is transient, and the sweep backs off rather than hammering
 * Discord (which is what earns a temporary Cloudflare ban: 10,000 invalid
 * requests per 10 minutes).
 */
export function classifyEditFailure(error: unknown): EditFailure {
  const status = numericField(error, 'status');
  if (status === 403 || status === 404) return 'dead';

  const code = numericField(error, 'code') ?? numericField(field(error, 'rawError'), 'code');
  if (code !== null && DEAD_CODES.has(code)) return 'dead';

  return 'transient';
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function numericField(value: unknown, key: string): number | null {
  const raw = field(value, key);
  return typeof raw === 'number' ? raw : null;
}
