import type { Type } from '@nestjs/common';
import type { ButtonHandler, CommandHandler } from './handler.types';
import { PingCommand } from './ping.command';
import { PickHandler } from './pick.handler';
import { LinkHandler } from './link.handler';
import { PicksCommand } from '../picks/picks.command';
import { LeaderboardCommand } from '../leaderboard/leaderboard.command';
import { SetupCommand } from '../setup/setup.command';
import { StatusCommand } from '../ops/status.command';
import { LinkCommand } from '../linking/link.command';
import { UnlinkCommand } from '../linking/unlink.command';

/**
 * The single table of interaction handlers.
 *
 * Every chunk that owns a handler fills in the stub body at the path named here;
 * none of them adds or renames an entry, so this file never conflicts. The
 * classes are providers in `app.module.ts`, which is why they can take injected
 * dependencies without anyone touching wiring.
 *
 * Button `custom_id`s are namespaced (`pick:<gameId>:<side>`), so dispatch is a
 * prefix match rather than a lookup of the full id.
 */
export const BUTTON_PREFIXES = ['pick:', 'link:', 'refresh:'] as const;

export type ButtonPrefix = (typeof BUTTON_PREFIXES)[number];

export const BUTTON_HANDLERS: Readonly<Record<string, Type<ButtonHandler> | undefined>> = {
  'pick:': PickHandler,
  'link:': LinkHandler,
  // `refresh:` is routed so a stale card can ask to be re-rendered, but no chunk
  // owns a handler for it yet. The router answers "unknown action" until one does.
};

export const COMMAND_HANDLERS: Readonly<Record<string, Type<CommandHandler> | undefined>> = {
  ping: PingCommand,
  picks: PicksCommand,
  leaderboard: LeaderboardCommand,
  setup: SetupCommand,
  status: StatusCommand,
  link: LinkCommand,
  unlink: UnlinkCommand,
};

/** Command handler classes, in registration order, without the gaps. */
export function commandHandlerClasses(): Type<CommandHandler>[] {
  return Object.values(COMMAND_HANDLERS).filter(
    (Handler): Handler is Type<CommandHandler> => Handler !== undefined,
  );
}
