import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DiscordConfigModule } from './config/config.module';
import { DatabaseService } from './infrastructure/database.service';
import { RedisService } from './infrastructure/redis.service';
import { RateLimiter } from './infrastructure/rate-limiter';
import { DiscordClientService } from './infrastructure/discord-client.service';
import { IknoballClient } from './api/iknoball.client';
import { InteractionRouter } from './interactions/router';
import { PingCommand } from './interactions/ping.command';
import { PickHandler } from './interactions/pick.handler';
import { LinkHandler } from './interactions/link.handler';
import { PicksCommand } from './picks/picks.command';
import { LeaderboardCommand } from './leaderboard/leaderboard.command';
import { SetupCommand } from './setup/setup.command';
import { StatusCommand } from './ops/status.command';
import { LinkCommand } from './linking/link.command';
import { UnlinkCommand } from './linking/unlink.command';
import { LockModule } from './lock/lock.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { MembersModule } from './members/members.module';

@Module({
  imports: [
    DiscordConfigModule,
    // Makes @Cron available to the sweeps and the slate scheduler.
    ScheduleModule.forRoot(),
    LockModule,
    SchedulerModule,
    MembersModule,
  ],
  providers: [
    DatabaseService,
    RedisService,
    RateLimiter,
    IknoballClient,
    DiscordClientService,
    InteractionRouter,
    // Interaction handlers are providers so a later chunk can inject a service
    // into one without editing this file: the registry names them, this list
    // only instantiates them.
    PingCommand,
    PickHandler,
    LinkHandler,
    PicksCommand,
    LeaderboardCommand,
    SetupCommand,
    StatusCommand,
    LinkCommand,
    UnlinkCommand,
  ],
})
export class AppModule {}
