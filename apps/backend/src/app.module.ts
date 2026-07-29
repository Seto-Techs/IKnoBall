import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminController } from './admin.controller';
import { UserController } from './user.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { EmailModule } from './infrastructure/email/email.module';
import { emailConfig } from './infrastructure/email/email.config';
import { RedisModule } from './infrastructure/redis/redis.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { WinstonModule } from 'nest-winston';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './infrastructure/better-auth/auth.config';
import { AuthRateLimitMiddleware } from './infrastructure/better-auth/rate-limit.middleware';
import { EmailService } from './infrastructure/email/email.service';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { createLoggerOptions } from './infrastructure/logger/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [emailConfig] }),
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
  controllers: [AppController, AdminController, UserController],
  providers: [AppService, { provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthRateLimitMiddleware)
      .forRoutes(
        { path: '/auth/sign-up/email', method: RequestMethod.POST },
        { path: '/auth/sign-in/email', method: RequestMethod.POST },
        { path: '/auth/request-password-reset', method: RequestMethod.POST },
      );
  }
}
