import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

// ── Zod schemas (source of truth for runtime validation) ──

export const registerSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── Swagger class shells (metadata + TypeScript types) ──
// Classes provide both the runtime token for @nestjs/swagger and
// the TypeScript type for consumers. No class-validator decorators.

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  email!: string;

  @ApiProperty({ example: 'John Doe', description: 'User display name' })
  name!: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password (min 8 chars)' })
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'abc123...', description: 'Email verification token' })
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com', description: 'Registered email address' })
  email!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password' })
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Registered email address' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123...', description: 'Password reset token' })
  token!: string;

  @ApiProperty({ example: 'NewSecurePass456!', description: 'New password (min 8 chars)' })
  newPassword!: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'abc...', description: 'Refresh token received at login' })
  refreshToken!: string;
}
