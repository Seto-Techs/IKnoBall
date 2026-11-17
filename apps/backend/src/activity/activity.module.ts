import { Module } from '@nestjs/common';
import { DiscordLinkModule } from '../discord-link/discord-link.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * The Discord Activity's sign-in.
 *
 * `DiscordLinkModule` is imported for its exported `DiscordLinkService` — the
 * same instance the bot's `/link` writes through — so an activity launch and a
 * bot command can never disagree about which IKnoBall user a Discord id is.
 */
@Module({
  imports: [DiscordLinkModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
