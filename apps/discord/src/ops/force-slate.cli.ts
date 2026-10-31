/**
 * The entry point behind `bun run force:slate`: container wiring, then `forceSlate`.
 *
 * Run it from this workspace (`bun run force:slate -- --guild <id>`), or inside the
 * deployed container against the built output (`node dist/ops/force-slate.cli.js
 * --guild <id>`), where the same environment the bot reads is already set.
 *
 * **A REST client, never the gateway.** Logging this client in would open a second
 * session on the same token, and a new IDENTIFY for a shard disconnects the session
 * already on it — the live bot would flap for as long as this command runs. So the
 * client is never logged in; the token goes straight onto its REST layer, which is
 * all a post needs. Two consequences, both handled here:
 *
 * - A channel is only resolvable for a guild the client knows, and a client with no
 *   gateway knows none. Every target is therefore fetched over REST first.
 * - `guild.members.me` is unknown without a gateway, so `SlatePoster`'s permission
 *   preflight has nothing to check and is skipped. A channel the bot cannot post in
 *   surfaces as a Discord API error in this command's output instead of a silent
 *   skip — which is the useful answer for an operator, since they can fix it.
 *
 * No `ScheduleModule` and no `AppModule` here: importing the root module would start
 * every cron in the bot, including the two that post slates.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
// Cascade, same as `main.ts`: root .env first (defaults), then CWD .env (overrides).
config({ path: '../../.env' });
config({ path: '../.env' });
config({ override: true });
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DiscordConfigModule } from '../config/config.module';
import { DiscordConfigService } from '../config/discord-config.service';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { InteractionRouter } from '../interactions/router';
import { Infrastructure } from '../scheduler/infrastructure';
import { SlatePoster } from '../scheduler/slate-poster';
import { DrizzleSlateStore, SLATE_STORE } from '../scheduler/slate-store';
import { GuildConfigService } from '../setup/guild-config.service';
import { forceSlate, parseArgs, USAGE, type Args } from './force-slate';
import { paused } from './kill-switch';

/**
 * The smallest context that can post a slate: the database it reads and claims in,
 * the poster that does it, the guilds it posts to, and a client for the sends.
 *
 * `RedisService` is deliberately absent. The post path never touches Redis — the day
 * key belongs to `SlateScheduler` — and a command that connects to Redis only to
 * disconnect would fail for no reason when it is not reachable from where it runs.
 */
@Module({
  imports: [DiscordConfigModule],
  providers: [
    DatabaseService,
    DiscordClientService,
    // `DiscordClientService` needs a router even with no gateway to feed it.
    InteractionRouter,
    Infrastructure,
    GuildConfigService,
    DrizzleSlateStore,
    { provide: SLATE_STORE, useExisting: DrizzleSlateStore },
    SlatePoster,
  ],
})
class ForceSlateModule {}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    // A mistyped command is not a failed post: exit 2, as `USAGE` promises.
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const app = await NestFactory.createApplicationContext(ForceSlateModule, {
    logger: ['warn', 'error'],
  });

  try {
    const config = app.get(DiscordConfigService);

    // The kill switch stops every trigger, and a manual one is still a post.
    if (paused(config)) {
      console.error(
        'DISCORD_ENABLED=false, so nothing is posted. Turn it back on and restart the bot, then run this again.',
      );
      process.exitCode = 2;
      return;
    }

    const client = app.get(DiscordClientService).client;
    client.rest.setToken(config.token);

    process.exitCode = await forceSlate(
      args,
      {
        guilds: app.get(GuildConfigService),
        poster: app.get(SlatePoster),
        hydrate: async (guildId) => {
          await client.guilds.fetch(guildId);
        },
        out: (line) => console.log(line),
      },
      new Date(),
    );
  } finally {
    // Closes the pool and destroys the client; without it the process would hang on
    // the database connection it opened.
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
