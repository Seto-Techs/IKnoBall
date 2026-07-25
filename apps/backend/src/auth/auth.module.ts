import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../helper/database/database.module';
import { JwtModule } from '../helper/jwt/jwt.module';
import { EmailModule } from '../helper/email/email.module';
import { RedisModule } from '../helper/redis/redis.module';

@Module({
  imports: [DatabaseModule, JwtModule, EmailModule, RedisModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
