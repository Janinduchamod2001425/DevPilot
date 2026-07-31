import { createSign } from "node:crypto";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GitHubAccountType } from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";
import type {
  GitHubInstallationResponse,
  GitHubInstallationTokenResponse,
  GitHubRepositoriesResponse,
} from "./github.types.js";

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface RootDirectoryCandidate {
  rootDirectory: string;
  deployable: boolean;
  framework: string | null;
  packageManager: string | null;
  markers: string[];
}

export interface RootDirectoriesResponse {
  repository: {
    id: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
  recommendedRootDirectory: string;
  candidates: RootDirectoryCandidate[];
  treeTruncated: boolean;
}

@Injectable()
export class GitHubService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  getInstallationUrl(): string {
    const appSlug = this.configService.getOrThrow<string>("GITHUB_APP_SLUG");

    return `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`;
  }

  async saveInstallation(userId: string, installationId: string) {
    if (!/^\d+$/.test(installationId)) {
      throw new BadRequestException("Invalid GitHub installation ID");
    }

    const githubInstallation = await this.getGitHubInstallation(installationId);

    const accountType =
      githubInstallation.account.type === "Organization"
        ? GitHubAccountType.ORGANIZATION
        : GitHubAccountType.USER;

    return this.prismaService.client.gitHubInstallation.upsert({
      where: {
        installationId,
      },
      update: {
        userId,
        accountId: String(githubInstallation.account.id),
        accountLogin: githubInstallation.account.login,
        accountType,
        avatarUrl: githubInstallation.account.avatar_url,
        repositorySelection: githubInstallation.repository_selection,
        suspendedAt: githubInstallation.suspended_at
          ? new Date(githubInstallation.suspended_at)
          : null,
      },
      create: {
        installationId,
        userId,
        accountId: String(githubInstallation.account.id),
        accountLogin: githubInstallation.account.login,
        accountType,
        avatarUrl: githubInstallation.account.avatar_url,
        repositorySelection: githubInstallation.repository_selection,
        suspendedAt: githubInstallation.suspended_at
          ? new Date(githubInstallation.suspended_at)
          : null,
      },
      select: {
        id: true,
        installationId: true,
        accountId: true,
        accountLogin: true,
        accountType: true,
        avatarUrl: true,
        repositorySelection: true,
        suspendedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findInstallations(userId: string) {
    return this.prismaService.client.gitHubInstallation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        installationId: true,
        accountId: true,
        accountLogin: true,
        accountType: true,
        avatarUrl: true,
        repositorySelection: true,
        suspendedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findRepositories(userId: string, databaseInstallationId?: string) {
    const installation = await this.resolveInstallation(
      userId,
      databaseInstallationId,
    );

    if (installation.suspendedAt) {
      throw new BadRequestException(
        "This GitHub App installation is suspended",
      );
    }

    const installationToken = await this.createInstallationToken(
      installation.installationId,
    );

    const repositories: GitHubRepositoriesResponse["repositories"] = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
        {
          headers: this.createGitHubHeaders(installationToken),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        throw new BadGatewayException(
          `GitHub repository request returned HTTP ${response.status}`,
        );
      }

      const result = (await response.json()) as GitHubRepositoriesResponse;

      repositories.push(...result.repositories);

      if (result.repositories.length < 100) {
        break;
      }

      page += 1;
    }

    return {
      installation: {
        id: installation.id,
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        avatarUrl: installation.avatarUrl,
      },
      repositories: repositories.map((repository) => ({
        id: String(repository.id),
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        htmlUrl: repository.html_url,
        cloneUrl: repository.clone_url,
        defaultBranch: repository.default_branch,
        owner: {
          id: String(repository.owner.id),
          login: repository.owner.login,
          avatarUrl: repository.owner.avatar_url,
        },
      })),
    };
  }

  async findAuthorizedRepository(
    userId: string,
    databaseInstallationId: string,
    repositoryId: string,
  ) {
    const result = await this.findRepositories(userId, databaseInstallationId);

    const repository = result.repositories.find(
      (item) => item.id === repositoryId,
    );

    if (!repository) {
      throw new NotFoundException(
        "The repository was not found or is not authorized for this GitHub installation",
      );
    }

    return {
      installation: result.installation,
      repository,
    };
  }

  async detectRootDirectories(
    userId: string,
    databaseInstallationId: string,
    repositoryId: string,
  ): Promise<RootDirectoriesResponse> {
    const { installation, repository } = await this.findAuthorizedRepository(
      userId,
      databaseInstallationId,
      repositoryId,
    );

    const installationToken = await this.createInstallationToken(
      installation.installationId,
    );

    const owner = encodeURIComponent(repository.owner.login);
    const repositoryName = encodeURIComponent(repository.name);
    const branch = encodeURIComponent(repository.defaultBranch);

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repositoryName}/git/trees/${branch}?recursive=1`,
      {
        headers: this.createGitHubHeaders(installationToken),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (response.status === 404) {
      throw new NotFoundException(
        "The repository tree or default branch could not be found",
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `GitHub repository-tree request returned HTTP ${response.status}`,
      );
    }

    const result = (await response.json()) as GitHubTreeResponse;

    const ignoredDirectories = new Set([
      "node_modules",
      ".git",
      ".next",
      ".nuxt",
      ".output",
      "dist",
      "build",
      "coverage",
      "vendor",
    ]);

    const deployableMarkers = new Set([
      "package.json",
      "Dockerfile",
      "pyproject.toml",
      "requirements.txt",
      "pom.xml",
      "build.gradle",
      "go.mod",
      "Cargo.toml",
    ]);

    const directoryFiles = new Map<string, Set<string>>();

    // Root must always be available as a choice.
    directoryFiles.set(".", new Set());

    for (const item of result.tree) {
      if (item.type !== "blob") {
        continue;
      }

      const pathParts = item.path.split("/");

      if (pathParts.some((part) => ignoredDirectories.has(part))) {
        continue;
      }

      const fileName = pathParts.pop();

      if (!fileName) {
        continue;
      }

      const directory = pathParts.length === 0 ? "." : pathParts.join("/");

      const existingFiles = directoryFiles.get(directory) ?? new Set<string>();

      existingFiles.add(fileName);
      directoryFiles.set(directory, existingFiles);
    }

    const candidates: RootDirectoryCandidate[] = [];

    for (const [rootDirectory, files] of directoryFiles.entries()) {
      const markers = [...files].filter((file) => deployableMarkers.has(file));

      const deployable = markers.length > 0;

      // Keep root available even when it is not deployable.
      if (rootDirectory !== "." && !deployable) {
        continue;
      }

      candidates.push({
        rootDirectory,
        deployable,
        framework: this.detectFramework(files),
        packageManager: this.detectPackageManager(files),
        markers,
      });
    }

    candidates.sort((first, second) => {
      if (first.rootDirectory === ".") return -1;
      if (second.rootDirectory === ".") return 1;

      if (first.deployable !== second.deployable) {
        return first.deployable ? -1 : 1;
      }

      const firstDepth = first.rootDirectory.split("/").length;
      const secondDepth = second.rootDirectory.split("/").length;

      if (firstDepth !== secondDepth) {
        return firstDepth - secondDepth;
      }

      return first.rootDirectory.localeCompare(second.rootDirectory);
    });

    const rootCandidate = candidates.find(
      (candidate) => candidate.rootDirectory === ".",
    );

    const recommendedCandidate = rootCandidate?.deployable
      ? rootCandidate
      : candidates.find((candidate) => candidate.deployable);

    return {
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
      },
      recommendedRootDirectory: recommendedCandidate?.rootDirectory ?? ".",
      candidates,
      treeTruncated: result.truncated,
    };
  }

  getDashboardRedirectUrl(parameters: Record<string, string>): string {
    const dashboardUrl = this.configService.getOrThrow<string>("DASHBOARD_URL");

    const redirectUrl = new URL("/new", dashboardUrl);

    for (const [key, value] of Object.entries(parameters)) {
      redirectUrl.searchParams.set(key, value);
    }

    return redirectUrl.toString();
  }

  private async resolveInstallation(
    userId: string,
    databaseInstallationId?: string,
  ) {
    if (databaseInstallationId) {
      const installation =
        await this.prismaService.client.gitHubInstallation.findFirst({
          where: {
            id: databaseInstallationId,
            userId,
          },
        });

      if (!installation) {
        throw new NotFoundException("GitHub installation was not found");
      }

      return installation;
    }

    const installations =
      await this.prismaService.client.gitHubInstallation.findMany({
        where: {
          userId,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 2,
      });

    if (installations.length === 0) {
      throw new NotFoundException("No GitHub App installation is connected");
    }

    if (installations.length > 1) {
      throw new BadRequestException(
        "installationId is required when multiple GitHub installations exist",
      );
    }

    return installations[0];
  }

  private async getGitHubInstallation(
    installationId: string,
  ): Promise<GitHubInstallationResponse> {
    const appJwt = this.createAppJwt();

    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: this.createGitHubHeaders(appJwt),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 404) {
      throw new NotFoundException("The GitHub App installation was not found");
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `GitHub installation request returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as GitHubInstallationResponse;
  }

  private async createInstallationToken(
    installationId: string,
  ): Promise<string> {
    const appJwt = this.createAppJwt();

    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: this.createGitHubHeaders(appJwt),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `GitHub installation-token request returned HTTP ${response.status}`,
      );
    }

    const result = (await response.json()) as GitHubInstallationTokenResponse;

    if (!result.token) {
      throw new BadGatewayException(
        "GitHub did not return an installation token",
      );
    }

    return result.token;
  }

  private createAppJwt(): string {
    const appId = this.configService.getOrThrow<string>("GITHUB_APP_ID");

    const encodedPrivateKey = this.configService.getOrThrow<string>(
      "GITHUB_PRIVATE_KEY_BASE64",
    );

    let privateKey: string;

    try {
      privateKey = Buffer.from(encodedPrivateKey, "base64").toString("utf8");
    } catch {
      throw new UnauthorizedException("The GitHub private key is invalid");
    }

    if (!privateKey.includes("BEGIN RSA PRIVATE KEY")) {
      throw new UnauthorizedException("The GitHub private key is invalid");
    }

    const currentTime = Math.floor(Date.now() / 1_000);

    const header = this.base64UrlEncode({
      alg: "RS256",
      typ: "JWT",
    });

    const payload = this.base64UrlEncode({
      iat: currentTime - 60,
      exp: currentTime + 9 * 60,
      iss: appId,
    });

    const unsignedToken = `${header}.${payload}`;

    const signature = createSign("RSA-SHA256")
      .update(unsignedToken)
      .end()
      .sign(privateKey, "base64url");

    return `${unsignedToken}.${signature}`;
  }

  private base64UrlEncode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  private detectFramework(files: Set<string>): string | null {
    const fileNames = [...files];

    if (
      fileNames.some(
        (file) =>
          file === "next.config.js" ||
          file === "next.config.mjs" ||
          file === "next.config.ts",
      )
    ) {
      return "Next.js";
    }

    if (
      fileNames.some(
        (file) => file === "nuxt.config.js" || file === "nuxt.config.ts",
      )
    ) {
      return "Nuxt";
    }

    if (
      fileNames.some(
        (file) =>
          file === "vite.config.js" ||
          file === "vite.config.ts" ||
          file === "vite.config.mjs",
      )
    ) {
      return "Vite";
    }

    if (files.has("angular.json")) {
      return "Angular";
    }

    if (files.has("pom.xml")) {
      return "Maven";
    }

    if (files.has("build.gradle")) {
      return "Gradle";
    }

    if (files.has("pyproject.toml") || files.has("requirements.txt")) {
      return "Python";
    }

    if (files.has("go.mod")) {
      return "Go";
    }

    if (files.has("Cargo.toml")) {
      return "Rust";
    }

    if (files.has("package.json")) {
      return "Node.js";
    }

    if (files.has("Dockerfile")) {
      return "Docker";
    }

    return null;
  }

  private detectPackageManager(files: Set<string>): string | null {
    if (files.has("pnpm-lock.yaml")) {
      return "pnpm";
    }

    if (files.has("yarn.lock")) {
      return "yarn";
    }

    if (files.has("bun.lock") || files.has("bun.lockb")) {
      return "bun";
    }

    if (files.has("package-lock.json")) {
      return "npm";
    }

    if (files.has("package.json")) {
      return "npm";
    }

    return null;
  }

  private createGitHubHeaders(token: string): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "DevPilot",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}
