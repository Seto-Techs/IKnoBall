import { markPaused } from './interaction-log';

/**
 * The kill switch (DISC-14): one predicate and one wording, so every call site
 * reads the same and nothing drifts.
 *
 * `DISCORD_ENABLED=false` has to *stop* the bot, not just change a log line. The
 * four things it stops, and the one thing it does not:
 *
 * - **No slate posts.** `SlateScheduler.tick` returns before it looks at a guild.
 * - **No rollover, no recaps.** `RolloverScheduler.tick` returns the same way, so a
 *   guild with no slate to roll onto is not posted one at midnight either.
 * - **No tip-off locks, no settlement edits.** Both sweeps return before `run()`,
 *   so nothing is edited in Discord and no card is stamped.
 * - **No picks.** A click is answered with `PAUSED_REPLY` and nothing is written.
 *   Refusing the click is the half the brief calls out: a card whose buttons still
 *   answer "Locked in" would look live while the schedule is off, and the pick
 *   would land in a table nobody is posting from.
 * - **`/status` still answers.** It is the operator's way to see the switch is off;
 *   a diagnostic that the kill switch kills is not a diagnostic.
 *
 * The flag itself is read by `DiscordConfigService.enabled` (`DISCORD_ENABLED`,
 * default on), so this file only interprets it. Nothing here re-reads `process.env`.
 */

/** The one field of `DiscordConfigService` the switch needs. */
export interface KillSwitch {
  readonly enabled: boolean;
}

/** True when the bot must not post, lock, settle, or write a pick. */
export function paused(switchState: KillSwitch): boolean {
  return !switchState.enabled;
}

/**
 * What a pick click gets while the switch is off.
 *
 * It says *paused*, not *failed*: the bot is deliberately off, and a user who is
 * told "try again" will try again. It also says nothing was saved, because that is
 * the question the clicker actually has.
 */
export const PAUSED_REPLY =
  'Picks are paused right now: the bot is in maintenance mode and nothing was saved. ' +
  'Try again once the slate is back, or pick on the website.';

/** The part of an interaction a paused refusal needs: it must already be acked. */
export interface PausedInteraction {
  editReply(options: { content: string }): Promise<unknown>;
}

/**
 * Refuse an interaction because of the switch: one wording, one log outcome.
 *
 * Marking the interaction is what makes the router log `outcome=paused` instead of
 * `ok` (see `interaction-log.ts`), so a maintenance window is visible in the logs
 * without every handler reporting a reason.
 */
export async function refusePaused(interaction: PausedInteraction): Promise<void> {
  markPaused(interaction);
  await interaction.editReply({ content: PAUSED_REPLY });
}
