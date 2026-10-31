/**
 * `bun run force:slate` — post one slate day's cards now, from a shell.
 *
 * The bot has two triggers of its own: `SlateScheduler` posts at each guild's local
 * hour, and `RolloverScheduler` posts the next day once the last game goes final.
 * Neither can be asked to post on demand, which leaves a bad set of options on the
 * morning a guild's post did not happen: wait a day, or edit `discord_cards` by
 * hand. This is the third trigger, and the only one an operator can pull.
 *
 * Three properties, because a manual post is the one that can quietly diverge from
 * the automatic ones:
 *
 * 1. **It is the same post.** Everything after the day key — selection, claim,
 *    send — is `SlatePoster.postFor`, the method both crons call. This file
 *    adds an entry point, not a second implementation.
 * 2. **It cannot double-post.** The cards are claimed in `discord_cards` with
 *    `on conflict do nothing` before anything is sent, so a day that is already
 *    out answers `already-posted` instead of posting twice. The Redis day key is
 *    left alone: it is `SlateScheduler`'s cheap filter, and the durable guard it
 *    fronts is the claim.
 * 3. **It is an operator tool, not a feature.** No slash command, nothing in the
 *    command picker, no help copy, no changelog entry — in 0.3.2 or later. Adding
 *    it to any of those is a product decision, not a docs tidy-up.
 *
 * This half is the part worth testing: arguments, day validation, target
 * resolution, and one line of output per guild. `force-slate.cli.ts` is the
 * container wiring around it, and there is nothing there but plumbing.
 */
import type { PostResult, SlateTarget } from '../scheduler/slate-poster';
import { type SlateGame } from '../scheduler/slate';
import {
  ET_TIME_ZONE,
  etDateKey,
  formatDayKey,
  isDateKey,
  localClock,
} from '../scheduler/slate-date';

/** What one run was asked to do, straight off the command line. */
export interface Args {
  /** Post for this one server. Exactly one of `guild`/`all`. */
  guild?: string;
  /** Post for every server `/setup` has enabled. */
  all: boolean;
  /** Slate day, `YYYY-MM-DD` in US/Eastern. Defaults to today's ET day. */
  day?: string;
  /** Print the games that would go out; claim and send nothing. */
  dryRun: boolean;
  help: boolean;
}

export const USAGE = `Post a slate day's cards now, through the same poster the bot's crons use.

Usage:
  bun run force:slate --guild <guild id> [--day YYYY-MM-DD] [--dry-run]
  bun run force:slate --all [--day YYYY-MM-DD] [--dry-run]

Options:
  --guild <id>  Post for this one server.
  --all         Post for every server /setup has enabled.
  --day <date>  Slate day, US/Eastern, YYYY-MM-DD. Defaults to today (ET).
  --dry-run     List the games that would go out. Claims and sends nothing.
  --help        This text.

Exit code: 0 when every target posted or had nothing left to send, 1 when a target
failed, 2 for a bad invocation.`;

/** A guild and the channel its slate goes in: what a post needs. */
export type Target = Pick<SlateTarget, 'guildId' | 'channelId'>;

/** Everything a run touches outside this file, so a test can stand in for all of it. */
export interface ForceDeps {
  guilds: {
    get(guildId: string): Promise<Target | null>;
    listEnabled(): Promise<Target[]>;
  };
  poster: {
    plan(etKey: string, now: Date): Promise<SlateGame[]>;
    postFor(target: SlateTarget, etKey: string, now: Date): Promise<PostResult>;
  };
  /**
   * Put the guild into the client's cache before the poster runs.
   *
   * `SlatePoster` resolves its channel with `client.channels.fetch`, and discord.js
   * builds a guild channel only for a guild it already knows. The bot's client knows
   * its guilds from the gateway; this one has no gateway (see `force-slate.cli.ts`),
   * so the guild is fetched over REST first.
   */
  hydrate(guildId: string): Promise<void>;
  /** One line of terminal output. Injected so the tests can read what a run said. */
  out(line: string): void;
}

/**
 * Parse the command line.
 *
 * Throws on anything malformed rather than guessing: `--guild` with no value or an
 * unknown flag is a mistake with a silent wrong outcome (`--guild` swallowed as a
 * guild id would post to nobody), and both are cheaper to fix as errors.
 */
export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { all: false, dryRun: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--guild':
        args.guild = value(argv, (index += 1), arg);
        break;
      case '--all':
        args.all = true;
        break;
      case '--day':
        args.day = value(argv, (index += 1), arg);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument "${arg}". See --help.`);
    }
  }

  // `--help` wins over everything: a half-written command should still explain itself.
  if (args.help) return args;

  if (args.all === Boolean(args.guild)) {
    throw new Error('Pass exactly one of --guild <id> or --all. See --help.');
  }

  return args;
}

function value(argv: readonly string[], index: number, flag: string): string {
  const found = argv[index];
  if (!found || found.startsWith('--')) throw new Error(`${flag} needs a value. See --help.`);
  return found;
}

/**
 * Post (or preview) the day, and say what happened.
 *
 * Returns the exit code rather than exiting, so the caller owns the process and a
 * test owns the code: 0 for a run where every target posted or had nothing left to
 * send, 1 when a target failed, 2 when the invocation itself was wrong.
 */
export async function forceSlate(args: Args, deps: ForceDeps, now: Date): Promise<number> {
  const etKey = args.day ?? etDateKey(now);

  if (!isDateKey(etKey)) {
    deps.out(`"${etKey}" is not a day. Use YYYY-MM-DD, e.g. ${etDateKey(now)}.`);
    return 2;
  }

  const targets = await resolveTargets(args, deps);
  if (targets.length === 0) return 1;

  deps.out(`Slate — ${formatDayKey(etKey)} (ET)${args.dryRun ? ', dry run: nothing is sent' : ''}`);

  let failed = 0;
  for (const target of targets) {
    try {
      if (args.dryRun) {
        await preview(etKey, target, deps, now);
        continue;
      }

      await deps.hydrate(target.guildId);
      const result = await deps.poster.postFor(
        { guildId: target.guildId, channelId: target.channelId },
        etKey,
        now,
      );
      for (const line of report(result, target)) deps.out(line);
    } catch (error) {
      // One guild's failure is not the run's: the rest still post, and the exit
      // code carries the bad news.
      failed += 1;
      deps.out(`  ${target.guildId}: failed — ${message(error)}`);
    }
  }

  return failed === 0 ? 0 : 1;
}

/** The guilds this run is for. Empty means nothing can be posted, with the reason printed. */
async function resolveTargets(args: Args, deps: ForceDeps): Promise<Target[]> {
  if (args.all) {
    const all = await deps.guilds.listEnabled();
    if (all.length === 0) {
      deps.out('No server has a slate channel yet: nobody has run /setup.');
      return [];
    }
    return all;
  }

  const guildId = args.guild as string;
  const settings = await deps.guilds.get(guildId);
  if (!settings) {
    deps.out(`Server ${guildId} has no slate channel yet. Run /setup channel:#nba there first.`);
    return [];
  }
  return [settings];
}

/** `--dry-run`: the games a real post would send, with nothing claimed. */
async function preview(etKey: string, target: Target, deps: ForceDeps, now: Date): Promise<void> {
  const games = await deps.poster.plan(etKey, now);

  if (games.length === 0) {
    deps.out(`  ${target.guildId}: no game that day is still open for picks.`);
    return;
  }

  deps.out(
    `  ${target.guildId} → channel ${target.channelId}: ${count(games.length)} would go out`,
  );
  for (const game of games) deps.out(`    ${tipOff(game)}  ${matchup(game)}  ${game.gameId}`);
}

/** What happened to one guild, in the operator's terms. */
function report(result: PostResult, target: Target): string[] {
  const where = `  ${target.guildId} → channel ${target.channelId}: `;

  if (result.status === 'empty') {
    return [`${where}nothing sent, no game that day is still open for picks.`];
  }

  if (result.status === 'already-posted') {
    return [
      `${where}nothing sent, every card that day is already claimed for this server,`,
      '    so it was posted before or a run stopped before sending. Clear that day’s',
      '    discord_cards rows for this guild to post it again.',
    ];
  }

  const lines = [`${where}posted ${count(result.games)}.`];

  for (const id of result.messageIds) {
    lines.push(`    <https://discord.com/channels/${target.guildId}/${target.channelId}/${id}>`);
  }

  return lines;
}

/** `18:00 ET`, or a plain admission that the schedule has no tip-off. */
function tipOff(game: SlateGame): string {
  const at = game.gameDateTimeUTC;
  return at ? `${localClock(at, ET_TIME_ZONE)} ET,`.padEnd(9) : 'time TBD ';
}

function matchup(game: SlateGame): string {
  return `${game.awayTeamTricode ?? 'TBD'} @ ${game.homeTeamTricode ?? 'TBD'}`;
}

function count(games: number): string {
  return `${games} card${games === 1 ? '' : 's'}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
