import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../helper/prisma/prisma.module';
import { JwtModule } from '../helper/jwt/jwt.module';
import { EmailModule } from '../helper/email/email.module';
import { RedisModule } from '../helper/redis/redis.module';

@Module({
  imports: [PrismaModule, JwtModule, EmailModule, RedisModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
