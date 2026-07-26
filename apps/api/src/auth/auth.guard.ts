import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedUser } from "./auth.types.js";

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const cookieName = this.authService.getCookieName();

    const sessionToken = request.cookies?.[cookieName] as string | undefined;

    const user = await this.authService.getAuthenticatedUser(sessionToken);

    if (!user) {
      throw new UnauthorizedException(
        "You must be logged in to access this resource",
      );
    }

    request.user = user;

    return true;
  }
}
