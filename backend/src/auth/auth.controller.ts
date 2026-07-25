import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiConflictResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ContextService } from '../helper/context/context.service';
import {
  RegisterDto,
  VerifyEmailDto,
  ResendVerificationDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshDto,
} from './auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly context: ContextService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', description: 'Creates a user account and sends a verification email.' })
  @ApiCreatedResponse({ description: 'User registered successfully, verification email sent.' })
  @ApiConflictResponse({ description: 'Email already registered' })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address', description: 'Verifies a user email using the token sent during registration.' })
  @ApiOkResponse({ description: 'Email verified successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired verification token' })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification email', description: 'Sends a new verification email if the email is registered and not yet verified (always returns 200 to prevent email enumeration).' })
  @ApiOkResponse({ description: 'If that email is registered, a new verification link has been sent.' })
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in', description: 'Authenticates and creates a session. Returns access token + refresh token.' })
  @ApiOkResponse({ description: 'Login successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials, deactivated, or unverified' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.authService.login(dto, userAgent, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token', description: 'Exchanges a valid refresh token for a new access + refresh token pair.' })
  @ApiOkResponse({ description: 'Token refreshed' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session', description: 'Revokes the current session.' })
  @ApiOkResponse({ description: 'Session revoked' })
  @HttpCode(HttpStatus.OK)
  async logout() {
    const payload = this.context.getUser();
    return this.authService.logoutCurrentSession(payload.sub, payload.sessionId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions', description: 'Lists all active sessions for the authenticated user.' })
  @ApiOkResponse({ description: 'List of sessions' })
  @HttpCode(HttpStatus.OK)
  async listSessions() {
    const payload = this.context.getUser();
    return this.authService.listSessions(payload.sub);
  }

  @Get('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get session detail', description: 'Returns details for a specific session.' })
  @ApiOkResponse({ description: 'Session detail' })
  @ApiBadRequestResponse({ description: 'Session not found' })
  @HttpCode(HttpStatus.OK)
  async getSession(@Param('id') id: string) {
    const payload = this.context.getUser();
    return this.authService.getSession(payload.sub, id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete session', description: 'Revokes a specific session (logs out that device).' })
  @ApiOkResponse({ description: 'Session revoked' })
  @ApiBadRequestResponse({ description: 'Session not found' })
  @HttpCode(HttpStatus.OK)
  async deleteSession(@Param('id') id: string) {
    const payload = this.context.getUser();
    return this.authService.deleteSession(payload.sub, id);
  }
}
