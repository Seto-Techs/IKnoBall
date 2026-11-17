import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `POST /activity/session` body.
 *
 * `code` is the one-time OAuth code `commands.authorize` hands the activity. It
 * is short-lived and single-use, so nothing else belongs in this request.
 */
export const activitySessionSchema = z.object({
  code: z.string().trim().min(1, 'code is required'),
});

export class ActivitySessionDto extends createZodDto(activitySessionSchema) {}
