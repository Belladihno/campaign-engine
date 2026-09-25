import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Shape placed on the request by JwtStrategy (TRD §7.1:
// JWT payload is `{ sub: userId, workspaceId }`).
export interface AuthenticatedUser {
  userId: string;
  workspaceId: string;
}

// Usage: handler(@CurrentUser() user: AuthenticatedUser)
// or handler(@CurrentUser('workspaceId') workspaceId: string)
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user[data] : request.user;
  },
);
