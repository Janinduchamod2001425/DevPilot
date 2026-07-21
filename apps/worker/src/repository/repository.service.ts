import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, rm } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export type CloneRepositoryInput = {
  deploymentId: string;
  repositoryUrl: string;
  branch: string;
};

export type CloneRepositoryResult = {
  workspacePath: string;
  commitSha: string;
  commitMessage: string;
};

@Injectable()
export class RepositoryService {
  private readonly workspaceRoot: string;

  constructor(configService: ConfigService) {
    const configuredRoot =
      configService.get<string>("DEPLOYMENT_WORKSPACE_ROOT") ??
      "../../.devpilot/workspaces";

    this.workspaceRoot = resolve(process.cwd(), configuredRoot);
  }

  async cloneRepository(
    input: CloneRepositoryInput,
  ): Promise<CloneRepositoryResult> {
    this.validateRepositoryUrl(input.repositoryUrl);
    this.validateBranch(input.branch);

    const workspacePath = this.resolveDeploymentWorkspace(input.deploymentId);

    await mkdir(this.workspaceRoot, {
      recursive: true,
    });

    // Remove a partial workspace from an earlier
    // attempt using this same deployment ID.
    await rm(workspacePath, {
      recursive: true,
      force: true,
    });

    await this.runGit(
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        input.branch,
        "--",
        input.repositoryUrl,
        workspacePath,
      ],
      process.cwd(),
    );

    const commitSha = await this.runGit(["rev-parse", "HEAD"], workspacePath);

    const commitMessage = await this.runGit(
      ["log", "-1", "--pretty=%s"],
      workspacePath,
    );

    return {
      workspacePath,
      commitSha,
      commitMessage,
    };
  }

  private validateRepositoryUrl(repositoryUrl: string): void {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(repositoryUrl);
    } catch {
      throw new Error("Repository URL is invalid");
    }

    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);

    const isValid =
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "github.com" &&
      pathSegments.length === 2 &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      !parsedUrl.search &&
      !parsedUrl.hash;

    if (!isValid) {
      throw new Error(
        "Only standard HTTPS GitHub repository URLs are currently supported",
      );
    }
  }

  private validateBranch(branch: string): void {
    const validCharacters = /^[A-Za-z0-9._/-]+$/;

    const isValid =
      validCharacters.test(branch) &&
      !branch.startsWith("-") &&
      !branch.includes("..") &&
      !branch.includes("@{") &&
      !branch.endsWith("/") &&
      !branch.startsWith("/");

    if (!isValid) {
      throw new Error(`Invalid Git branch: ${branch}`);
    }
  }

  private resolveDeploymentWorkspace(deploymentId: string): string {
    const workspacePath = resolve(this.workspaceRoot, deploymentId);

    const relativePath = relative(this.workspaceRoot, workspacePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Deployment workspace escaped the configured root");
    }

    return workspacePath;
  }

  private async runGit(args: string[], cwd: string): Promise<string> {
    try {
      const result = await execFileAsync("git", args, {
        cwd,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });

      return String(result.stdout).trim();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Git error";

      throw new Error(`Git operation failed: ${message}`, { cause: error });
    }
  }
}
