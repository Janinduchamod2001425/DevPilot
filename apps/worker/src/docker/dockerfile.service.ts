import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import type { RepositoryAnalysis } from "../analyzer/repository-analyzer.service.js";

export type DockerfileResult = {
  dockerfilePath: string;
  buildContextPath: string;
  generated: boolean;
};

@Injectable()
export class DockerfileService {
  async prepare(
    workspacePath: string,
    analysis: RepositoryAnalysis,
  ): Promise<DockerfileResult> {
    const projectPath = this.resolveProjectPath(
      workspacePath,
      analysis.rootDirectory,
    );

    const existingDockerfilePath = join(projectPath, "Dockerfile");

    if (await this.fileExists(existingDockerfilePath)) {
      await this.validateExistingDockerfile(existingDockerfilePath);

      return {
        dockerfilePath: existingDockerfilePath,
        buildContextPath: workspacePath,
        generated: false,
      };
    }

    const content = this.generateDockerfile(analysis);

    const generatedDockerfilePath = join(workspacePath, ".devpilot.Dockerfile");

    await writeFile(generatedDockerfilePath, content, "utf8");

    return {
      dockerfilePath: generatedDockerfilePath,
      buildContextPath: workspacePath,
      generated: true,
    };
  }

  private generateDockerfile(analysis: RepositoryAnalysis): string {
    if (
      analysis.framework === "Nuxt.js" &&
      analysis.packageManager === "pnpm"
    ) {
      return this.generateNuxtPnpmDockerfile(analysis.rootDirectory);
    }

    throw new Error(
      `Automatic Dockerfile generation is not yet supported for ${analysis.framework} with ${analysis.packageManager}`,
    );
  }

  private generateNuxtPnpmDockerfile(rootDirectory: string): string {
    const normalizedRootDirectory = this.normalizeRootDirectory(rootDirectory);

    return `FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @devpilot/dashboard run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \\
    && adduser --system --uid 1001 nuxt

COPY --from=builder --chown=nuxt:nodejs /app/${normalizedRootDirectory}/.output ./.output

USER nuxt

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
`;
  }

  private normalizeRootDirectory(rootDirectory: string): string {
    const normalized = rootDirectory
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    if (
      !normalized ||
      normalized === "." ||
      normalized.startsWith("/") ||
      normalized.includes("..")
    ) {
      throw new Error(
        `Invalid Docker application root directory: ${rootDirectory}`,
      );
    }

    return normalized;
  }

  private resolveProjectPath(
    workspacePath: string,
    rootDirectory: string,
  ): string {
    const projectPath = resolve(workspacePath, rootDirectory);

    const relativePath = relative(workspacePath, projectPath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(
        "Docker application path escaped the repository workspace",
      );
    }

    return projectPath;
  }

  private async validateExistingDockerfile(
    dockerfilePath: string,
  ): Promise<void> {
    const content = await readFile(dockerfilePath, "utf8");

    if (!content.trim()) {
      throw new Error(`Existing Dockerfile is empty: ${dockerfilePath}`);
    }

    if (Buffer.byteLength(content, "utf8") > 1_000_000) {
      throw new Error("Existing Dockerfile exceeds the permitted size");
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
