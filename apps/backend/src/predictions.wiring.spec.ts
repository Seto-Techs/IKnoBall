import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { OddsService } from './odds.service';
import { DatabaseService } from './infrastructure/database/database.service';

// vitest transpiles with esbuild, which does not emit decorator metadata, so the
// Nest testing module cannot infer the constructor dependencies.
Reflect.defineMetadata('design:paramtypes', [DatabaseService, OddsService], PredictionsService);
Reflect.defineMetadata('design:paramtypes', [PredictionsService], PredictionsController);

describe('predictions wiring', () => {
  it('resolves the controller and its service', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        PredictionsService,
        { provide: OddsService, useValue: { getGameOdds: async () => null } },
        { provide: DatabaseService, useValue: { db: {} } },
      ],
    }).compile();

    expect(moduleRef.get(PredictionsController)).toBeInstanceOf(PredictionsController);
    expect(moduleRef.get(PredictionsService)).toBeInstanceOf(PredictionsService);
  });
});
