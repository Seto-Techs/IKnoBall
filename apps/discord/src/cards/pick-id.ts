import type { OddsSide } from '@iknoball/predictions';

/**
 * The `custom_id` a pick button carries, and the parser the handler runs on it.
 *
 * `pick:<gameId>:<side>` is deliberately parseable without a lookup: the handler
 * has 3 seconds to acknowledge and nothing else on the interaction payload names
 * the game. It also matches the `pick:` prefix `interactions/router.ts`
 * dispatches on, and the `custom_id` budget (100 chars) with room to spare.
 *
 * Both halves live here so the card that writes the id and the handler that reads
 * it cannot drift apart.
 */

export interface PickTarget {
  gameId: string;
  side: OddsSide;
}

export function pickCustomId(gameId: string, side: OddsSide): string {
  return `pick:${gameId}:${side}`;
}

/** Null for anything that is not exactly `pick:<gameId>:<side>`. */
export function parsePickCustomId(customId: string): PickTarget | null {
  const [prefix, gameId, side, ...rest] = customId.split(':');

  if (prefix !== 'pick' || rest.length > 0) return null;
  if (!gameId) return null;
  if (side !== 'home' && side !== 'away') return null;

  return { gameId, side };
}
