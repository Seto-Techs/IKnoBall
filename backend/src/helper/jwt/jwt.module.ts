import { Global, Module } from '@nestjs/common';
import { JwtHelperService } from './jwt.service';

@Global()
@Module({
  providers: [JwtHelperService],
  exports: [JwtHelperService],
})
export class JwtModule {}
