import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { EmailModule } from './infrastructure/email/email.module';
import { emailConfig } from './infrastructure/email/email.config';
import { RedisModule } from './infrastructure/redis/redis.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { WinstonModule } from 'nest-winston';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './infrastructure/better-auth/auth.config';
import { EmailService } from './infrastructure/email/email.service';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { createLoggerOptions } from './infrastructure/logger/logger.config';
import { ZodValidationPipe, ZodSerializerInterceptor } from 'nestjs-zod';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [emailConfig], envFilePath: ['.env', '../.env', '../../.env'] }),
    WinstonModule.forRoot(createLoggerOptions()),
    DatabaseModule,
    EmailModule,
    RedisModule,
    S3Module,
    AuthModule.forRootAsync({
      imports: [EmailModule],
      inject: [EmailService],
      useFactory: (email: EmailService) => ({ auth: createAuth(email) }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
