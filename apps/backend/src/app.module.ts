import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './helper/database/database.module';
import { JwtModule } from './helper/jwt/jwt.module';
import { EmailModule } from './helper/email/email.module';
import { ContextModule } from './helper/context/context.module';
import { ContextMiddleware } from './helper/context/context.middleware';
import { AuthModule } from './auth/auth.module';
import { emailConfig } from './helper/email/email.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [emailConfig] }),
    DatabaseModule,
    JwtModule,
    EmailModule,
    ContextModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
