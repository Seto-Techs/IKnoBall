import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ApplicationCommandType,
  Client,
  EntryPointCommandHandlerType,
  Events,
  GatewayIntentBits,
} from 'discord.js';
import type { PrimaryEntryPointCommandData } from 'discord.js';
import { DiscordConfigService } from '../config/discord-config.service';
import { InteractionRouter } from '../interactions/router';

/**
 * The gateway connection.
 *
 * Gateway rather than an HTTP interactions endpoint: there is no public route to
 * expose, no Ed25519 signature check to bolt onto a backend that runs with
 * `bodyParser: false`, and discord.js owns reconnect/resume and the rate-limit
 * buckets for us.
 *
 * Two intents: `Guilds` and `Guild Members`.
 *
 * `Guilds` is the baseline — guild lifecycle, channel resolution, slash command
 * registration. `Guild Members` is the one privileged intent we request, and it
 * exists for a single feature: the per-server leaderboard, which ranks the points
 * of everyone *in* that server and so needs the membership list mirrored locally
 * (`discord_members`). See DISC-08 for the definition and the review consequences.
 *
 * `MESSAGE_CONTENT` and `GUILD_PRESENCES` are never requested: the bot reads no
 * messages and sees no online status.
 */
@Injectable()
export class DiscordClientService implements OnModuleDestroy {
  private readonly logger = new Logger(DiscordClientService.name);
  private readonly raw: Client;

  /**
   * The gateway client, for chunks that fetch channels, messages, or members.
   *
   * Exposed rather than passed around so `lock/`, `scheduler/`, and `members/` can
   * each register their own listeners and REST calls without any of them editing
   * this file — it is trunk wiring, and a feature chunk that needs the client
   * takes this getter instead.
   */
  get client(): Client {
    return this.raw;
  }

  constructor(
    private readonly config: DiscordConfigService,
    private readonly router: InteractionRouter,
  ) {
    this.raw = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    this.raw.on(Events.InteractionCreate, (interaction) => {
      void this.router.handle(interaction);
    });

    this.raw.on(Events.Error, (error) => {
      this.logger.error(`Discord client error: ${error.message}`, error.stack);
    });

    /**
     * The gateway's own lifecycle, logged.
     *
     * discord.js reconnects on its own, but a socket that dies without a close
     * frame — a suspended machine, a dropped NAT entry — leaves the client
     * waiting on a connection that will never deliver an event again. Nothing
     * throws, nothing warns, and the first symptom is a command that silently
     * does nothing. These four events are the difference between "the bot is
     * dead" and "the bot is fine and Discord never sent anything".
     */
    this.raw.on(Events.ShardDisconnect, (event, shardId) => {
      this.logger.warn(`Discord: shard ${shardId} disconnected (code ${event.code}).`);
    });
    this.raw.on(Events.ShardReconnecting, (shardId) => {
      this.logger.warn(`Discord: shard ${shardId} reconnecting.`);
    });
    this.raw.on(Events.ShardResume, (shardId, replayed) => {
      this.logger.log(`Discord: shard ${shardId} resumed (${replayed} event(s) replayed).`);
    });
    this.raw.on(Events.ShardError, (error, shardId) => {
      this.logger.error(`Discord: shard ${shardId} error: ${error.message}`, error.stack);
    });
  }

  /**
   * Connect and wait for the login handshake.
   *
   * `login()` rejects for a token Discord will not accept, and that rejection is
   * the whole point: it propagates to `main.ts`, which exits non-zero. Retrying
   * a bad token forever would keep the process "up" while it can never serve an
   * interaction, so there is deliberately no retry loop here.
   */
  async start(): Promise<void> {
    this.raw.once(Events.ClientReady, (ready) => {
      void this.onReady(ready);
    });

    await this.raw.login(this.config.token);
  }

  async onModuleDestroy(): Promise<void> {
    this.raw.destroy();
  }

  private async onReady(client: Client<true>): Promise<void> {
    this.logger.log(
      `Discord: logged in as ${client.user.tag} (${client.guilds.cache.size} guilds, enabled=${this.config.enabled})`,
    );

    try {
      await this.registerCommands();
    } catch (error) {
      // A failed registration must not kill a bot that can already answer
      // buttons; the next restart retries it.
      this.logger.error(
        `Discord: command registration failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Register the slash commands globally.
   *
   * Discord's global command PUT is a bulk overwrite, so running this on every
   * boot is idempotent: it updates changed definitions and removes ones the
   * registry no longer lists. No diffing, no stored hash to get out of sync.
   *
   * One command is not ours to describe: the Activity's `PRIMARY_ENTRY_POINT`
   * command, which Discord creates when Activities are enabled and which the
   * developer portal owns. A bulk overwrite that omits it is rejected with
   * 50240, so whatever entry point already exists is carried through untouched.
   *
   * A local bot sets `DISCORD_DEV_GUILD_ID` instead, and the same bulk overwrite
   * is aimed at that one guild: guild commands appear in seconds where a global
   * PUT waits on Discord's propagation, and nothing half-finished reaches the
   * application's real users. Entry points are global-only, so the dev path does
   * not carry one.
   */
  private async registerCommands(): Promise<void> {
    const application = this.raw.application;
    if (!application) {
      this.logger.warn('Discord: no application on the client, skipping command registration.');
      return;
    }

    const commands = this.router.commandDefinitions();
    const devGuildId = this.config.devGuildId;

    if (devGuildId) {
      await application.commands.set(commands, devGuildId);
      this.logger.log(
        `Discord: registered ${commands.length} commands in dev guild ${devGuildId} (${commands
          .map((command) => `/${command.name}`)
          .join(', ')})`,
      );
      return;
    }

    // Echoed back by name rather than id: the bulk overwrite upserts on the
    // pair (type, name), so this preserves the entry point instead of deleting
    // and recreating it.
    const entryPoints: PrimaryEntryPointCommandData[] = [
      ...(await application.commands.fetch()).values(),
    ]
      .filter((command) => command.type === ApplicationCommandType.PrimaryEntryPoint)
      .map((command) => ({
        name: command.name,
        description: command.description,
        type: ApplicationCommandType.PrimaryEntryPoint,
        handler: command.handler ?? EntryPointCommandHandlerType.DiscordLaunchActivity,
        integrationTypes: command.integrationTypes ?? undefined,
        contexts: command.contexts ?? undefined,
      }));

    await application.commands.set([...entryPoints, ...commands]);

    this.logger.log(
      `Discord: registered ${commands.length} global commands (${commands
        .map((command) => `/${command.name}`)
        .join(', ')})${entryPoints.length ? ' plus the Activity entry point' : ''}`,
    );
  }
}
