import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The three shapes the linking endpoints accept.
 *
 * The bot identifies the person by Discord id (`/internal/*` has no session);
 * the web page identifies them by session and sends only the code. Validation
 * failures are 400 — `AppModule` registers `ZodValidationPipe` as `APP_PIPE`.
 */

/** `GET`/`DELETE /internal/discord-link?discordUserId=`. */
export const resolveLinkQuerySchema = z.object({
  discordUserId: z.string().trim().min(1, 'discordUserId is required'),
});

export class ResolveLinkQueryDto extends createZodDto(resolveLinkQuerySchema) {}

/** `POST /internal/discord-link/code`. */
export const issueLinkCodeSchema = z.object({
  discordUserId: z.string().trim().min(1, 'discordUserId is required'),
});

export class IssueLinkCodeDto extends createZodDto(issueLinkCodeSchema) {}

/**
 * `POST /me/discord`. Shape only: `DiscordLinkService` normalises case and
 * decides whether the code exists, so a six-character check here would reject a
 * code that is merely lowercased.
 */
export const consumeLinkCodeSchema = z.object({
  code: z.string().trim().min(1, 'code is required').max(16),
});

export class ConsumeLinkCodeDto extends createZodDto(consumeLinkCodeSchema) {}
