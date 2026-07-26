import { utilities, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

export function createLoggerOptions(): WinstonModuleOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true })),
    transports: [
      new winston.transports.Console({
        format: isProduction
          ? winston.format.json()
          : winston.format.combine(
              winston.format.timestamp(),
              winston.format.ms(),
              utilities.format.nestLike('IKnoBall', { colors: true, prettyPrint: true }),
            ),
      }),
    ],
  };
}
