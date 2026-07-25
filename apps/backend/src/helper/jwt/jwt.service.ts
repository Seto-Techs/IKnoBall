import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtHelperService {
  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('JWT_SECRET')!;
  }

  private readonly secretKey: string;

  sign(payload: any, options?: jwt.SignOptions): string {
    return jwt.sign(payload, this.secretKey, options);
  }

  verify(token: string): any {
    try {
      return jwt.verify(token, this.secretKey);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  decode(token: string): any {
    return jwt.decode(token);
  }
}
