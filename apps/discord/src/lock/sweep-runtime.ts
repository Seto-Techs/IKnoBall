import type { ModuleRef } from '@nestjs/core';
import { DatabaseService } from '../infrastructure/database.service';
import { DiscordClientService } from '../infrastructure/discord-client.service';
import { RateLimiter } from '../infrastructure/rate-limiter';
import { DiscordCardEditor, type CardEditor } from './card-editor';
import { CardSweepRepository } from './sweep-repository';

/** What a sweep needs from the rest of the app, resolved once at startup. */
export interface SweepRuntime {
  repository: CardSweepRepository;
  editor: CardEditor;
  /** One outbound Discord call, paced by DISC-12's shared queue. */
  pace: <T>(task: () => Promise<T>) => Promise<T>;
}

/**
 * Resolve the shared services a sweep needs.
 *
 * `DatabaseService`, `DiscordClientService` and `RateLimiter` are providers of the
 * root module, and a feature module cannot inject a parent's providers — the root
 * module would have to export them, and `app.module.ts` is trunk wiring this chunk
 * must not edit. `ModuleRef.get(token, { strict: false })` looks a token up in the
 * whole container instead, which is the same mechanism `interactions/router.ts`
 * uses to reach the handlers the root module instantiates.
 *
 * Called from `onModuleInit`, after every provider exists, so the lookup can never
 * race provider construction.
 */
export function buildSweepRuntime(moduleRef: ModuleRef): SweepRuntime {
  const database = moduleRef.get(DatabaseService, { strict: false });
  const discord = moduleRef.get(DiscordClientService, { strict: false });
  const rateLimiter = moduleRef.get(RateLimiter, { strict: false });

  return {
    repository: new CardSweepRepository(database.db),
    editor: new DiscordCardEditor(discord.client),
    pace: (task) => rateLimiter.schedule(task),
  };
}
