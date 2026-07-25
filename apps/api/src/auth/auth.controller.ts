import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("github")
  async authorizeWithGitHub(
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.authService.createGitHubAuthorization(returnTo);

    response.redirect(result.authorizationUrl);
  }

  @Get("github/callback")
  async handleGitHubCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (!code || !state) {
      throw new UnauthorizedException(
        "GitHub did not provide the required authorization parameters",
      );
    }

    const result = await this.authService.handleGitHubCallback(code, state);

    response.cookie(this.authService.getCookieName(), result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: this.authService.getSessionDurationMilliseconds(),
      path: "/",
    });

    response.redirect(result.redirectUrl);
  }

  @Get("me")
  async getCurrentUser(@Req() request: Request): Promise<{
    authenticated: boolean;
    user: Awaited<ReturnType<AuthService["getAuthenticatedUser"]>>;
  }> {
    const sessionToken = request.cookies?.[this.authService.getCookieName()] as
      | string
      | undefined;

    const user = await this.authService.getAuthenticatedUser(sessionToken);

    return {
      authenticated: user !== null,
      user,
    };
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const cookieName = this.authService.getCookieName();

    const sessionToken = request.cookies?.[cookieName] as string | undefined;

    await this.authService.logout(sessionToken);

    response.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return {
      success: true,
    };
  }
}
