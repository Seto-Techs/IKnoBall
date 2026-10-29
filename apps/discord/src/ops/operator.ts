/**
 * Who may run `/status`.
 *
 * An **allow-list of Discord user ids in the environment** (`DISCORD_OPERATOR_IDS`,
 * comma-separated), not a Discord permission check. The reasons, because the
 * alternative is tempting:
 *
 * - A guild owner or a server admin is *not* the bot operator. They administer
 *   their server; `/status` reports this process's connection, its Postgres
 *   counts, and its outbound queue. Handing that to every server owner means every
 *   customer sees the bot's operational state, and means the command has to exist
 *   in a guild at all — an operator may want it in a DM.
 * - A permission check would also need a permission the invite does not ask for
 *   (Manage Server is deliberately not requested; see DISC-01).
 *
 * **It fails closed.** Unset or empty means nobody is an operator, not everybody:
 * a forgotten env var must not publish the bot's internals, and the failure mode
 * ("`/status` refuses everyone") is obvious and harmless, where the opposite
 * ("`/status` answers anyone") is silent.
 */
export function operatorIds(
  raw: string | undefined = process.env.DISCORD_OPERATOR_IDS,
): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/** True only for an id on the allow-list; false when the list is unset. */
export function isOperator(
  discordUserId: string,
  allowList: ReadonlySet<string> = operatorIds(),
): boolean {
  return allowList.has(discordUserId);
}
