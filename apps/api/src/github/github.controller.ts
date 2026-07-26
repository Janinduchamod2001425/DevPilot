import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service.js";
import { GitHubService } from "./github.service.js";

@Controller("github")
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly authService: AuthService,
  ) {}

  @Get("install")
  async install(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.requireUser(request);
    response.redirect(this.githubService.getInstallationUrl());
  }

  @Get("setup")
  async setup(
    @Query("installation_id") installationId: string | undefined,
    @Query("setup_action") setupAction: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.requireUser(request);

    if (!installationId) {
      response.redirect(
        this.githubService.getDashboardRedirectUrl({
          github: "error",
          message: "missing_installation_id",
        }),
      );

      return;
    }

    const installation = await this.githubService.saveInstallation(
      user.id,
      installationId,
    );

    response.redirect(
      this.githubService.getDashboardRedirectUrl({
        github: "installed",
        installationId: installation.id,
        action: setupAction ?? "install",
      }),
    );
  }

  @Get("installations")
  async installations(@Req() request: Request) {
    const user = await this.requireUser(request);

    return this.githubService.findInstallations(user.id);
  }

  @Get("repositories")
  async repositories(
    @Query("installationId") installationId: string | undefined,
    @Req() request: Request,
  ) {
    const user = await this.requireUser(request);

    return this.githubService.findRepositories(user.id, installationId);
  }

  private async requireUser(request: Request) {
    const cookieName = this.authService.getCookieName();

    const sessionToken = request.cookies?.[cookieName] as string | undefined;

    const user = await this.authService.getAuthenticatedUser(sessionToken);

    if (!user) {
      throw new UnauthorizedException("Authentication is required");
    }

    return user;
  }
}
