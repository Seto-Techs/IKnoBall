import 'reflect-metadata';
import { config } from 'dotenv';
// Cascade, same as the worker: root .env first (defaults), then CWD .env (overrides)
config({ path: '../../.env' });
config({ path: '../.env' });
config({ override: true });
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DiscordClientService } from './infrastructure/discord-client.service';

async function bootstrap() {
  // An application context, not an HTTP server: the bot is driven entirely by the
  // gateway. Nest is here for DI, config, and the scheduler.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.enableShutdownHooks();

  // Resolving the client constructs nothing new — it is already a provider — and
  // `start()` waits for the login handshake, so a rejected token lands in the
  // catch below instead of in an unhandled rejection.
  await app.get(DiscordClientService).start();
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof Error) {
    logger.error(`discord bot failed to start: ${error.name}: ${error.message}`, error.stack);
  } else {
    logger.error(`discord bot failed to start: ${String(error)}`);
  }
  // Non-zero on purpose: an invalid or missing token is a deploy problem, and a
  // process that stays up while it can never log in is worse than one that dies.
  process.exit(1);
});
