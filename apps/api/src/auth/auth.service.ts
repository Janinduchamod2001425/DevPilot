import { createHash, randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service.js";
import type {
  AuthenticatedUser,
  GitHubTokenResponse,
  GitHubUserResponse,
} from "./auth.types.js";

type GitHubAuthorizationResult = {
  authorizationUrl: string;
};

type GitHubCallbackResult = {
  sessionToken: string;
  redirectUrl: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createGitHubAuthorization(
    returnTo?: string,
  ): Promise<GitHubAuthorizationResult> {
    const clientId = this.configService.getOrThrow<string>("GITHUB_CLIENT_ID");

    const callbackUrl = this.configService.getOrThrow<string>(
      "GITHUB_CALLBACK_URL",
    );

    const rawState = this.createSecureToken();
    const stateHash = this.hashToken(rawState);

    await this.prismaService.client.gitHubAuthState.create({
      data: {
        stateHash,
        returnTo: this.sanitizeReturnTo(returnTo),
        expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      },
    });

    const parameters = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      state: rawState,
    });

    return {
      authorizationUrl: `https://github.com/login/oauth/authorize?${parameters.toString()}`,
    };
  }

  async handleGitHubCallback(
    code: string,
    rawState: string,
  ): Promise<GitHubCallbackResult> {
    const stateHash = this.hashToken(rawState);

    const authState =
      await this.prismaService.client.gitHubAuthState.findUnique({
        where: {
          stateHash,
        },
      });

    if (!authState || authState.expiresAt <= new Date()) {
      if (authState) {
        await this.prismaService.client.gitHubAuthState.delete({
          where: {
            id: authState.id,
          },
        });
      }

      throw new UnauthorizedException(
        "The GitHub authorization state is invalid or expired",
      );
    }

    // A state must only be accepted once.
    await this.prismaService.client.gitHubAuthState.delete({
      where: {
        id: authState.id,
      },
    });

    const accessToken = await this.exchangeCodeForAccessToken(code);
    const githubUser = await this.getGitHubUser(accessToken);

    const user = await this.prismaService.client.user.upsert({
      where: {
        githubId: String(githubUser.id),
      },
      update: {
        username: githubUser.login,
        displayName: githubUser.name,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
      },
      create: {
        githubId: String(githubUser.id),
        username: githubUser.login,
        displayName: githubUser.name,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
      },
    });

    const sessionToken = this.createSecureToken();
    const sessionDurationDays = this.getSessionDurationDays();

    await this.prismaService.client.session.create({
      data: {
        tokenHash: this.hashToken(sessionToken),
        userId: user.id,
        expiresAt: new Date(
          Date.now() + sessionDurationDays * 24 * 60 * 60 * 1_000,
        ),
      },
    });

    const dashboardUrl = this.configService.getOrThrow<string>("DASHBOARD_URL");

    const redirectUrl = new URL(
      authState.returnTo ?? "/",
      dashboardUrl,
    ).toString();

    return {
      sessionToken,
      redirectUrl,
    };
  }

  async getAuthenticatedUser(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedUser | null> {
    if (!sessionToken) {
      return null;
    }

    const session = await this.prismaService.client.session.findUnique({
      where: {
        tokenHash: this.hashToken(sessionToken),
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt <= new Date()) {
      await this.prismaService.client.session.delete({
        where: {
          id: session.id,
        },
      });

      return null;
    }

    return {
      id: session.user.id,
      githubId: session.user.githubId,
      username: session.user.username,
      displayName: session.user.displayName,
      email: session.user.email,
      avatarUrl: session.user.avatarUrl,
    };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.prismaService.client.session.deleteMany({
      where: {
        tokenHash: this.hashToken(sessionToken),
      },
    });
  }

  getCookieName(): string {
    return (
      this.configService.get<string>("SESSION_COOKIE_NAME") ??
      "devpilot_session"
    );
  }

  getSessionDurationMilliseconds(): number {
    return this.getSessionDurationDays() * 24 * 60 * 60 * 1_000;
  }

  private async exchangeCodeForAccessToken(code: string): Promise<string> {
    const clientId = this.configService.getOrThrow<string>("GITHUB_CLIENT_ID");

    const clientSecret = this.configService.getOrThrow<string>(
      "GITHUB_CLIENT_SECRET",
    );

    const callbackUrl = this.configService.getOrThrow<string>(
      "GITHUB_CALLBACK_URL",
    );

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "DevPilot",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException(
        `GitHub token exchange returned HTTP ${response.status}`,
      );
    }

    const result = (await response.json()) as GitHubTokenResponse;

    if (!result.access_token) {
      throw new UnauthorizedException(
        result.error_description ??
          result.error ??
          "GitHub did not return an access token",
      );
    }

    return result.access_token;
  }

  private async getGitHubUser(
    accessToken: string,
  ): Promise<GitHubUserResponse> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "DevPilot",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new UnauthorizedException(
        `GitHub user request returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as GitHubUserResponse;
  }

  private sanitizeReturnTo(returnTo: string | undefined): string | null {
    if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
      return null;
    }

    return returnTo;
  }

  private createSecureToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private getSessionDurationDays(): number {
    const configuredValue = Number(
      this.configService.get<string>("SESSION_DURATION_DAYS") ?? "30",
    );

    if (!Number.isInteger(configuredValue) || configuredValue <= 0) {
      return 30;
    }

    return configuredValue;
  }
}
