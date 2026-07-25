import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { userSessions, users } from '@iknoball/database';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DatabaseService } from '../helper/database/database.service';
import { JwtHelperService } from '../helper/jwt/jwt.service';
import { EmailService } from '../helper/email/email.service';
import { RedisService } from '../helper/redis/redis.service';
import { EMAIL_FROM_KEYS } from '../helper/email/email.constants';
import type {
  ForgotPasswordInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@iknoball/schema/auth';

const VERIFY_TTL_SEC = 15 * 60; // 15 minutes
const TOKEN_PREFIX = 'verify:token:';
const USER_PREFIX = 'verify:user:';

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const SESSION_ACTIVE_PREFIX = 'sessions:active:';
const SESSION_REFRESH_PREFIX = 'sessions:refresh:';
const ACCESS_TOKEN_EXPIRY = '15m';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly appUrl: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtHelperService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
  }

  // ───────────────────────────────
  // Registration & Verification
  // ───────────────────────────────

  async register(dto: RegisterInput) {
    const [existing] = await this.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [user] = await this.database.db
      .insert(users)
      .values({ email: dto.email, name: dto.name, passwordHash })
      .returning();

    await this.storeVerificationToken(user.id, user.email, user.name);

    return {
      data: { userId: user.id },
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  async verifyEmail(dto: VerifyEmailInput) {
    const tokenKey = `${TOKEN_PREFIX}${dto.token}`;

    const exists = await this.redis.keyExists(tokenKey);
    if (!exists) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const userId = await this.redis.getKey(tokenKey);

    const [user] = await this.database.db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.database.db
      .update(users)
      .set({ isVerified: true, verifiedAt: new Date() })
      .where(eq(users.id, user.id));

    await this.redis.deleteKey(tokenKey);
    try {
      await this.redis.deleteKey(`${USER_PREFIX}${user.id}`);
    } catch {
      /* ok */
    }

    this.logger.log(`Email verified: ${user.email}`);

    return { data: null, message: 'Email verified successfully' };
  }

  async resendVerification(dto: ResendVerificationInput) {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, dto.email)).limit(1);

    if (!user) {
      this.logger.warn(`Resend verification requested for unknown email: ${dto.email}`);
      return {
        data: null,
        message: 'If that email is registered, a new verification link has been sent.',
      };
    }

    if (user.isVerified) {
      this.logger.warn(`Resend verification requested for already verified user: ${dto.email}`);
      return {
        data: null,
        message: 'If that email is registered, a new verification link has been sent.',
      };
    }

    await this.invalidateExistingToken(user.id);
    await this.storeVerificationToken(user.id, user.email, user.name);

    this.logger.log(`Verification email resent: ${user.email}`);

    return {
      data: null,
      message: 'If that email is registered, a new verification link has been sent.',
    };
  }

  // ───────────────────────────────
  // Login (creates session)
  // ───────────────────────────────

  async login(dto: LoginInput, userAgent?: string, ipAddress?: string) {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, dto.email)).limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionId = randomUUID();
    const refreshToken = randomBytes(48).toString('hex');
    const refreshTokenHash = hashToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SEC * 1000);

    // Store in PostgreSQL (audit log)
    await this.database.db.insert(userSessions).values({
      id: sessionId, userId: user.id, userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null, refreshTokenHash, lastUsedAt: now, expiresAt,
    });

    // Store in Redis (hot path)
    await this.setSessionInRedis(sessionId, refreshTokenHash);

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, sessionId },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    this.logger.log(`User logged in: ${user.email} session=${sessionId}`);

    return {
      data: {
        accessToken,
        refreshToken,
        sessionId,
        expiresAt,
        user: { id: user.id, email: user.email, name: user.name },
      },
      message: 'Login successful',
    };
  }

  // ───────────────────────────────
  // Token Refresh (rotates session)
  // ───────────────────────────────

  async refresh(dto: RefreshInput) {
    const tokenHash = hashToken(dto.refreshToken);
    const refreshKey = `${SESSION_REFRESH_PREFIX}${tokenHash}`;

    // Redis lookup first
    let sessionId: string | null = null;
    try {
      sessionId = await this.redis.getKey(refreshKey);
    } catch {
      // fall through to DB check
    }

    // Fallback: find session by hash in DB
    if (!sessionId) {
      const [session] = await this.database.db
        .select()
        .from(userSessions)
        .where(and(eq(userSessions.refreshTokenHash, tokenHash), isNull(userSessions.revokedAt)))
        .limit(1);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      sessionId = session.id;
    }

    // Re-fetch session from DB for full state
    const [session] = await this.database.db
      .select({ session: userSessions, user: users })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.id, sessionId))
      .limit(1);

    if (!session || session.session.revokedAt || session.session.expiresAt < new Date()) {
      // Clean up stale Redis keys
      await this.cleanupSessionRedis(sessionId!, tokenHash);
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Check that user is still active
    if (!session.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Rotate refresh token
    const newRefreshToken = randomBytes(48).toString('hex');
    const newHash = hashToken(newRefreshToken);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + SESSION_TTL_SEC * 1000);

    await this.database.db
      .update(userSessions)
      .set({ refreshTokenHash: newHash, lastUsedAt: now, expiresAt: newExpiresAt })
      .where(eq(userSessions.id, session.session.id));

    // Rotate Redis keys
    await this.redis.deleteKey(refreshKey);
    await this.setSessionInRedis(session.session.id, newHash);

    const accessToken = this.jwt.sign(
      { sub: session.user.id, email: session.user.email, sessionId: session.session.id },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    this.logger.log(`Token refreshed: session=${session.session.id}`);

    return {
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        sessionId: session.session.id,
        expiresAt: newExpiresAt,
        user: { id: session.user.id, email: session.user.email, name: session.user.name },
      },
      message: 'Token refreshed',
    };
  }

  // ───────────────────────────────
  // Session CRUD
  // ───────────────────────────────

  async listSessions(userId: string) {
    const sessions = await this.database.db
      .select({ id: userSessions.id, userAgent: userSessions.userAgent, ipAddress: userSessions.ipAddress,
        lastUsedAt: userSessions.lastUsedAt, expiresAt: userSessions.expiresAt, createdAt: userSessions.createdAt })
      .from(userSessions)
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .orderBy(desc(userSessions.lastUsedAt));

    return { data: sessions };
  }

  async getSession(userId: string, sessionId: string) {
    const [session] = await this.database.db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1);

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    return {
      data: {
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
      },
    };
  }

  async deleteSession(userId: string, sessionId: string) {
    const [session] = await this.database.db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1);

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.database.db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, sessionId));

    // Eject from Redis
    await this.cleanupSessionRedis(sessionId, session.refreshTokenHash ?? undefined);

    this.logger.log(`Session revoked: ${sessionId}`);
    return { data: null, message: 'Session revoked' };
  }

  async logoutCurrentSession(userId: string, sessionId: string) {
    // Same as delete, but self-service — no need to re-fetch for ownership
    const [session] = await this.database.db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1);

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    return this.deleteSession(userId, sessionId);
  }

  // ───────────────────────────────
  // Guard helpers
  // ───────────────────────────────

  async isSessionActive(sessionId: string): Promise<boolean> {
    try {
      return await this.redis.keyExists(`${SESSION_ACTIVE_PREFIX}${sessionId}`);
    } catch {
      // Redis down — trust the JWT
      return true;
    }
  }

  // ───────────────────────────────
  // Forgot / Reset Password
  // ───────────────────────────────

  async forgotPassword(dto: ForgotPasswordInput) {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, dto.email)).limit(1);

    if (!user) {
      this.logger.warn(`Forgot password requested for unknown email: ${dto.email}`);
      return { message: 'If that email is registered, a password reset link has been sent.' };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.database.db.update(users).set({ resetToken, resetTokenExpiry }).where(eq(users.id, user.id));

    const resetLink = `${this.appUrl}/auth/reset-password?token=${resetToken}`;

    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      link: resetLink,
      subject: 'Reset your IKnoBall password',
      fromKey: EMAIL_FROM_KEYS.verify,
    });

    this.logger.log(`Password reset email sent: ${user.email}`);

    return { message: 'If that email is registered, a password reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordInput) {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.resetToken, dto.token), gt(users.resetTokenExpiry, new Date())))
      .limit(1);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.database.db
      .update(users)
      .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
      .where(eq(users.id, user.id));

    this.logger.log(`Password reset completed: ${user.email}`);

    return { data: null, message: 'Password reset successfully' };
  }

  // ───────────────────────────────
  // Private helpers
  // ───────────────────────────────

  private async storeVerificationToken(userId: string, email: string, userName: string) {
    const token = randomBytes(32).toString('hex');
    await this.redis.setKey(`${TOKEN_PREFIX}${token}`, userId, VERIFY_TTL_SEC);
    await this.redis.setKey(`${USER_PREFIX}${userId}`, token, VERIFY_TTL_SEC);

    const verifyLink = `${this.appUrl}/auth/verify-email?token=${token}`;
    await this.emailService.sendVerifyEmail({
      to: email,
      name: userName,
      link: verifyLink,
      subject: 'Verify your IKnoBall account',
      fromKey: EMAIL_FROM_KEYS.verify,
    });
  }

  private async invalidateExistingToken(userId: string) {
    const userKey = `${USER_PREFIX}${userId}`;
    try {
      const oldToken = await this.redis.getKey(userKey);
      await this.redis.deleteKey(`${TOKEN_PREFIX}${oldToken}`);
    } catch {
      /* none */
    }
    try {
      await this.redis.deleteKey(userKey);
    } catch {
      /* ok */
    }
  }

  private async setSessionInRedis(sessionId: string, refreshTokenHash: string) {
    const ops: Promise<void>[] = [
      this.redis.setKey(`${SESSION_ACTIVE_PREFIX}${sessionId}`, '1', SESSION_TTL_SEC),
      this.redis.setKey(`${SESSION_REFRESH_PREFIX}${refreshTokenHash}`, sessionId, SESSION_TTL_SEC),
    ];
    await Promise.all(ops);
  }

  private async cleanupSessionRedis(sessionId: string, refreshTokenHash?: string) {
    const ops: Promise<void>[] = [
      this.redis.deleteKey(`${SESSION_ACTIVE_PREFIX}${sessionId}`).catch(() => {}),
    ];
    if (refreshTokenHash) {
      ops.push(
        this.redis.deleteKey(`${SESSION_REFRESH_PREFIX}${refreshTokenHash}`).catch(() => {}),
      );
    }
    await Promise.all(ops);
  }
}
