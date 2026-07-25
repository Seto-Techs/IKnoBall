import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmtpClient } from './transport/smtp.client';

@Module({
  providers: [EmailService, SmtpClient],
  exports: [EmailService],
})
export class EmailModule {}
