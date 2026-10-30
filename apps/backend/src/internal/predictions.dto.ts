import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `POST /internal/predictions` body.
 *
 * The bot resolves a Discord account to a `users.id` before it calls this, so
 * `userId` is part of the payload rather than the session — that is the whole
 * difference from the web route, which reads it from the session.
 *
 * Validation failures are 400: `AppModule` registers `ZodValidationPipe` as
 * `APP_PIPE`, so a malformed body never reaches the handler.
 */
export const placePickSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  gameId: z.string().trim().min(1, 'gameId is required'),
  /** Matches `OddsSide` in `@iknoball/predictions`. */
  side: z.enum(['home', 'away']),
});

export class PlacePickDto extends createZodDto(placePickSchema) {}
