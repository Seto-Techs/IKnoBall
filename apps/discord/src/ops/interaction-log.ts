import type { Interaction } from 'discord.js';
import { hashUserId } from './user-hash';

/**
 * One structured line per interaction, written by the router.
 *
 * The fields are the ones an operator needs at 3am: which server, which person
 * (hashed), which button or command, what happened, and how long it took. The
 * latency is the point — Discord gives an interaction 3 seconds to be
 * acknowledged and then fails it *silently* on the user's side ("This interaction
 * failed"), so a slow handler is invisible unless it is logged.
 *
 * Format is `key=value` pairs on a single line, not JSON: it stays readable in
 * Dokploy's log view and is still greppable (`rg 'outcome=failed'`,
 * `rg 'guild=1234'`, `rg 'ack=none'`). The event word comes first so a filter can
 * select interaction lines out of everything else the process logs.
 *
 * A line looks like:
 *
 * ```
 * interaction outcome=ok guild=1122334455 user=9f2a1c3b4d kind=button id=pick:0022600127:home ack=41ms latency_ms=63
 * ```
 */
export type InteractionOutcome =
  /** The handler ran to completion. */
  | 'ok'
  /** No handler is registered for this button prefix or command. */
  | 'unknown'
  /** Not a button or a slash command: the router does nothing with it. */
  | 'ignored'
  /** Refused because `DISCORD_ENABLED=false` (see `kill-switch.ts`). */
  | 'paused'
  /** The handler threw; the user got the generic failure reply. */
  | 'failed';

export interface InteractionTiming {
  outcome: InteractionOutcome;
  /** Router receipt → handler return, in ms. */
  latencyMs: number;
  /** Router receipt → first acknowledgement, or null when the handler never acked. */
  ackMs: number | null;
}

/**
 * Marks an interaction as refused by the kill switch.
 *
 * A symbol, not a string key: it must not collide with anything discord.js or a
 * handler puts on the interaction, and it should not look like payload data.
 */
const PAUSED = Symbol('iknoball.interaction.paused');

/**
 * Record that this interaction was refused by `DISCORD_ENABLED=false`.
 *
 * The handler is the only place that knows *why* it refused, and the router is the
 * only place that logs, so the reason travels on the interaction rather than
 * through a return type every handler would have to widen.
 */
export function markPaused(interaction: object): void {
  (interaction as Record<symbol, unknown>)[PAUSED] = true;
}

function isPaused(interaction: object): boolean {
  return (interaction as Record<symbol, unknown>)[PAUSED] === true;
}

export function interactionLog(interaction: Interaction, timing: InteractionTiming): string {
  // A paused click returns normally, so the handler's success would otherwise be
  // logged as `ok` — hiding the one thing the operator wants to see during a
  // maintenance window: the switch is off and users are still clicking.
  const outcome = isPaused(interaction) ? 'paused' : timing.outcome;
  // Logging must never be the reason an interaction fails, so a payload without a
  // user (a fake in a test, or a future interaction type) logs `unknown` instead
  // of throwing on the way out of the router's `finally`.
  const userId = (interaction as { user?: { id?: string } }).user?.id;

  return [
    'interaction',
    `outcome=${outcome}`,
    // `dm` rather than an empty field: a command that is supposed to run in a
    // server answering in a DM is itself a signal.
    `guild=${interaction.guildId ?? 'dm'}`,
    `user=${userId === undefined ? 'unknown' : hashUserId(userId)}`,
    `kind=${kind(interaction)}`,
    `id=${subject(interaction)}`,
    // `none` with a latency over 3000 is the signature of a blown deadline; see
    // the runbook. A bare number is time-to-ack, not total handler time.
    `ack=${timing.ackMs === null ? 'none' : `${timing.ackMs}ms`}`,
    `latency_ms=${timing.latencyMs}`,
  ].join(' ');
}

/** The methods Discord counts as acknowledging an interaction. */
const ACK_METHODS = ['reply', 'deferReply', 'deferUpdate'] as const;

export interface AckTracker {
  /** Ms from `trackAck()` to the first acknowledgement attempt, or null. */
  ackMs(): number | null;
  /** Put the interaction's methods back. */
  stop(): void;
}

/**
 * Time the acknowledgement without asking every handler to report it.
 *
 * The 3-second deadline is about *when the handler first answers Discord*, not
 * about how long the work after that takes — `PickHandler` defers in its first
 * line and then spends as long as it likes on the API, and that is fine. So the
 * three acknowledging methods are wrapped for the duration of one dispatch and the
 * first call is stamped. Wrapping is per interaction instance (own properties
 * shadowing the prototype), so nothing global changes and the original method is
 * always called with the interaction as `this`.
 *
 * The stamp is the first *attempt*, not the first success: a handler that throws
 * on `reply` and then succeeds has already told us the timing that matters.
 */
export function trackAck(interaction: Interaction): AckTracker {
  const startedAt = Date.now();
  let ackedAt: number | null = null;
  const restores: (() => void)[] = [];
  const target = interaction as unknown as Record<string, unknown>;

  for (const method of ACK_METHODS) {
    const original = target[method];
    if (typeof original !== 'function') continue;

    const call = original as (...args: unknown[]) => unknown;
    target[method] = function patched(this: unknown, ...args: unknown[]): unknown {
      ackedAt ??= Date.now();
      return call.apply(this, args);
    };
    restores.push(() => {
      target[method] = original;
    });
  }

  return {
    ackMs: () => (ackedAt === null ? null : ackedAt - startedAt),
    stop: () => {
      for (const restore of restores) restore();
    },
  };
}

/** `button`, `command`, or the raw type for anything else. */
function kind(interaction: Interaction): string {
  if (interaction.isButton()) return 'button';
  if (interaction.isChatInputCommand()) return 'command';
  return `type:${interaction.type}`;
}

/** The custom id or the command name — the thing that identifies the action. */
function subject(interaction: Interaction): string {
  if (interaction.isButton()) return interaction.customId;
  if (interaction.isChatInputCommand()) return `/${interaction.commandName}`;
  return String(interaction.id);
}
