import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { discordConfig } from './discord.config';
import { DiscordConfigService } from './discord-config.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [discordConfig] })],
  providers: [DiscordConfigService],
  exports: [DiscordConfigService],
})
export class DiscordConfigModule {}
