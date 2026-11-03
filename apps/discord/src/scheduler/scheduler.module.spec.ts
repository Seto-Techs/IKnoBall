import { describe, expect, it } from 'vitest';
import { INJECTABLE_WATERMARK, MODULE_METADATA } from '@nestjs/common/constants';
import { SchedulerModule } from './scheduler.module';

/**
 * Every provider this module registers must be decorated `@Injectable()`.
 *
 * Not ceremony: Nest builds a provider from the class's `design:paramtypes`, and
 * TypeScript only emits that metadata for a decorated class. An undecorated
 * provider is constructed with **no arguments**, so its dependencies are silently
 * `undefined` and the failure surfaces only when something touches one — which is
 * exactly how `RolloverRepository` shipped: every rollover tick died on
 * `this.infra.db` for the life of the feature, and nothing failed at boot.
 *
 * The watermark is the cheap, honest check. Asserting `design:paramtypes` instead
 * would not work here: the build strips decorator metadata, so every class would
 * look broken.
 */
describe('the scheduler module’s providers', () => {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SchedulerModule) ?? [];

  /** Class providers only; a `{ provide, useExisting }` alias has no class to check. */
  const classes = providers.filter(
    (provider): provider is new () => unknown => typeof provider === 'function',
  );

  it('registers the ones the scheduler needs', () => {
    // A guard against the filter above silently matching nothing.
    expect(classes.length).toBeGreaterThanOrEqual(10);
  });

  it('decorates every class provider, so its dependencies are injected', () => {
    const undecorated = classes
      .filter((provider) => Reflect.getMetadata(INJECTABLE_WATERMARK, provider) !== true)
      .map((provider) => provider.name);

    expect(undecorated).toEqual([]);
  });
});
