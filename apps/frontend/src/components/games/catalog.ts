/**
 * The shelf: every mini game, in the order the surfaces show them.
 *
 * One list drives both places the games appear — the band on the landing page and
 * the games page — so adding a game is one entry here and nothing else. A `soon`
 * game carries no name or link on purpose: it is a slot on the shelf reserving
 * the shape, not a game anyone can describe yet.
 *
 * The board itself is not here: each card reads today's puzzle off the API, so
 * the shelf and the game can never advertise different players.
 */
export type MiniGame =
  | { state: 'live'; id: string; name: string; blurb: string; to: '/games/lebronnect' }
  | { state: 'soon'; id: string };

type LiveGame = Extract<MiniGame, { state: 'live' }>;

export const LEBRONNECT: LiveGame = {
  state: 'live',
  id: 'lebronnect',
  name: 'LeBronnect',
  blurb: 'Bridge them through teammates. Every link needs a shared season.',
  to: '/games/lebronnect',
};

export const MINI_GAMES: MiniGame[] = [
  LEBRONNECT,
  { state: 'soon', id: 'up-next-1' },
  { state: 'soon', id: 'up-next-2' },
];
