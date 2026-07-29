import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('IKnoBall API')
    .setDescription('IKnoBall backend REST API')
    .setVersion('1.0')
    .addServer(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'SessionToken')
    .addSecurityRequirements('SessionToken')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Patch in BetterAuth endpoints (middleware-mounted, not NestJS controllers)
  addBetterAuthPaths(document);

  // Serve Scalar API reference UI at /docs
  app.use(
    '/docs',
    apiReference({
      content: document,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

function addBetterAuthPaths(document: Record<string, any>) {
  const paths = (document.paths as Record<string, unknown>) ?? {};
  const schemas =
    ((document.components as Record<string, unknown>)?.schemas as Record<string, unknown>) ?? {};

  // Shared auth schemas
  Object.assign(schemas, {
    SignUpRequest: {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 100, example: 'Player' },
        email: { type: 'string', format: 'email', maxLength: 255, example: 'player@iknoball.test' },
        password: { type: 'string', minLength: 8, maxLength: 128, example: 'valid-password-123' },
      },
    },
    SignInRequest: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'player@iknoball.test' },
        password: { type: 'string', minLength: 1, example: 'valid-password-123' },
      },
    },
    SessionResponse: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            emailVerified: { type: 'boolean' },
            role: { type: 'string' },
            image: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
          },
        },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
            ipAddress: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
          },
        },
      },
    },
    ForgotPasswordRequest: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'player@iknoball.test' },
        redirectTo: {
          type: 'string',
          format: 'uri',
          example: 'http://localhost:5173/reset-password',
        },
      },
    },
    ResetPasswordRequest: {
      type: 'object',
      required: ['newPassword'],
      properties: {
        newPassword: {
          type: 'string',
          minLength: 8,
          maxLength: 128,
          example: 'new-valid-password-123',
        },
      },
    },
    ErrorResponse: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        message: { type: 'string' },
      },
    },
  });

  Object.assign(paths, {
    '/auth/sign-up/email': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description:
          'Creates a new user and sends a verification email. Login is blocked until email is verified.',
        operationId: 'signUp',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SignUpRequest' } },
          },
        },
        responses: {
          '200': { description: 'Account created. Verification email sent.' },
          '400': {
            description: 'Invalid input',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '429': { description: 'Rate limited (5 req / 5 min)' },
        },
      },
    },
    '/auth/sign-in/email': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        description: 'Authenticates a user. Returns a session cookie. Requires verified email.',
        operationId: 'signIn',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SignInRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Signed in. Session cookie set.',
            headers: { 'Set-Cookie': { schema: { type: 'string' } } },
          },
          '403': {
            description: 'Email not verified',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '429': { description: 'Rate limited (10 req / 5 min)' },
        },
      },
    },
    '/auth/sign-out': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out',
        description: 'Destroys the current session.',
        operationId: 'signOut',
        responses: {
          '200': { description: 'Signed out.' },
        },
      },
    },
    '/auth/get-session': {
      get: {
        tags: ['Auth'],
        summary: 'Get current session',
        description: 'Returns the current user and session data, or null if not authenticated.',
        operationId: 'getSession',
        responses: {
          '200': {
            description: 'Session data or null.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [{ $ref: '#/components/schemas/SessionResponse' }, { type: 'null' }],
                },
              },
            },
          },
        },
      },
    },
    '/auth/request-password-reset': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset',
        description:
          'Sends a password reset email if the account exists. Always returns 200 to prevent email enumeration.',
        operationId: 'forgotPassword',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordRequest' } },
          },
        },
        responses: {
          '200': { description: 'If account exists, reset email sent.' },
          '429': { description: 'Rate limited (3 req / 5 min)' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password',
        description: 'Resets the password using a token from the reset email.',
        operationId: 'resetPassword',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordRequest' } },
          },
        },
        parameters: [
          {
            name: 'token',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Reset token from email',
          },
        ],
        responses: {
          '200': { description: 'Password reset successfully.' },
          '400': {
            description: 'Invalid or expired token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/verify-email': {
      get: {
        tags: ['Auth'],
        summary: 'Verify email address',
        description:
          'Verifies the email using a token from the verification email. Redirects to the frontend on success.',
        operationId: 'verifyEmail',
        parameters: [
          {
            name: 'token',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Verification token from email',
          },
        ],
        responses: {
          '302': { description: 'Redirects to frontend on success.' },
          '400': { description: 'Invalid or expired token' },
        },
      },
    },
    '/auth/callback/discord': {
      get: {
        tags: ['Auth'],
        summary: 'Discord OAuth callback',
        description:
          'OAuth2 callback for Discord sign-in. Only available when Discord credentials are configured.',
        operationId: 'discordCallback',
        parameters: [
          {
            name: 'code',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'OAuth authorization code',
          },
          {
            name: 'state',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'OAuth state parameter',
          },
        ],
        responses: {
          '302': { description: 'Redirects to frontend with session cookie.' },
        },
      },
    },
  });
}
bootstrap();
