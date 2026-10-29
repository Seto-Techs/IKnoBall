import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `GET /internal/picks` query.
 *
 * `PredictionsService.listPicks` returns both modes for one user, so there is no
 * `mode` filter here: the bot narrows the list for display.
 */
export const listPicksQuerySchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
});

export class ListPicksQueryDto extends createZodDto(listPicksQuerySchema) {}
