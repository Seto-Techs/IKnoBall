import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { EmailModule } from './infrastructure/email/email.module';
import { emailConfig } from './infrastructure/email/email.config';
import { RedisModule } from './infrastructure/redis/redis.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './infrastructure/better-auth/auth.config';
import { EmailService } from './infrastructure/email/email.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [emailConfig] }),
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
  providers: [AppService],
})
export class AppModule {}
