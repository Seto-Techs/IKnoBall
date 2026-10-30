import { Module } from '@nestjs/common';
import { MembersRepository } from './members.repository';
import { MembersSync } from './members.sync';
import { MembersStore } from './members.types';

/**
 * The mirror of who is in which guild, which is what the per-server leaderboard
 * joins against.
 *
 * The sync reads a guild's member list when the bot joins, and keeps it current
 * from `guildMemberAdd`, `guildMemberRemove`, and `guildMemberUpdate`. It is the
 * only consumer of the privileged `Guild Members` intent, so it belongs next to
 * the board that needs it rather than in the trunk.
 *
 * No imports: `DiscordClientService` and `DatabaseService` are providers of
 * `AppModule`, which imports *this* module, so both are resolved from the whole
 * application graph with `ModuleRef.get(..., { strict: false })` — the same way
 * `InteractionRouter` reaches the handler providers. `MembersStore` is bound to
 * the repository so the sync never depends on the concrete SQL class.
 */
@Module({
  providers: [
    MembersRepository,
    { provide: MembersStore, useExisting: MembersRepository },
    MembersSync,
  ],
  exports: [MembersSync],
})
export class MembersModule {}
