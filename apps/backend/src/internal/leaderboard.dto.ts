import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `GET /internal/leaderboard` query.
 *
 * `guildId` and `mode` are both required: a board with the wrong dimension
 * silently filled in is worse than a 400 the bot can log. `mode` matches
 * `PredictionMode` in `@iknoball/predictions`.
 *
 * `viewerDiscordUserId` is optional and only adds a row: the caller's own, at its
 * true rank, when the top ten does not already contain it. It is a Discord user
 * id rather than an IKnoBall one because that is what an interaction carries, and
 * the API owns the `discord_links` lookup that turns it into a user.
 */
export const leaderboardQuerySchema = z.object({
  guildId: z.string().trim().min(1, 'guildId is required'),
  mode: z.enum(['flat', 'weighted']),
  viewerDiscordUserId: z.string().trim().min(1).optional(),
});

export class LeaderboardQueryDto extends createZodDto(leaderboardQuerySchema) {}
