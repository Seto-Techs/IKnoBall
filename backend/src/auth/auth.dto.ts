import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'John Doe', description: 'User display name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password (min 8 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'abc123...', description: 'Email verification token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com', description: 'Registered email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Registered email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123...', description: 'Password reset token' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'NewSecurePass456!', description: 'New password (min 8 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'abc...', description: 'Refresh token received at login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
