import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { InternalModule } from '../internal/internal.module';
import { DiscordLinkService } from './discord-link.service';
import { InternalDiscordLinkController } from './internal-discord-link.controller';
import { UserDiscordLinkController } from './user-discord-link.controller';

/**
 * Discord account linking (DISC-06, path A).
 *
 * Two doors into one service:
 *
 * - `InternalDiscordLinkController` — `/internal/discord-link`, the bot's three
 *   calls, behind `InternalTokenGuard` (exported by `InternalModule`, imported
 *   rather than copied so there is one guard).
 * - `UserDiscordLinkController` — `/me/discord`, the web page, behind the session.
 *
 * Both share the same `DiscordLinkService` instance, so a code issued by the bot
 * is the code the page spends, with no second copy of the resolution order.
 */
@Module({
  imports: [DatabaseModule, InternalModule],
  controllers: [InternalDiscordLinkController, UserDiscordLinkController],
  providers: [DiscordLinkService],
  exports: [DiscordLinkService],
})
export class DiscordLinkModule {}
