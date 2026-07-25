import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the current authenticated user (or a specific key) from the request.
 *
 * Requires JwtAuthGuard or OptionalAuthGuard to have run first
 * (they attach the decoded JWT payload to `request.user`).
 *
 * @example
 *   @Get('me')
 *   getMe(@CurrentUser() user: JwtPayload) { ... }
 *
 *   @Get('me')
 *   getEmail(@CurrentUser('email') email: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!data) return request.user;
    return request.user?.[data];
  },
);
