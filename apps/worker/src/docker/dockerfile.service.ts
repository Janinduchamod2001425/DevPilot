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
        buildContextPath: projectPath,
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

    if (
      analysis.framework === "React with Vite" &&
      analysis.packageManager === "npm"
    ) {
      return this.generateReactViteNpmDockerfile(analysis.rootDirectory);
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

COPY ["${normalizedRootDirectory}/package.json", "${normalizedRootDirectory}/pnpm-lock.yaml", "${normalizedRootDirectory}/pnpm-workspace.yaml", "./"]

RUN pnpm install --frozen-lockfile

COPY ["${normalizedRootDirectory}/", "./"]

RUN pnpm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \\
    && adduser --system --uid 1001 nuxt

COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output

USER nuxt

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
`;
  }

  private generateReactViteNpmDockerfile(rootDirectory: string): string {
    const normalizedRootDirectory = this.normalizeRootDirectory(rootDirectory);

    return `FROM node:22-alpine AS builder

WORKDIR /app

COPY ["${normalizedRootDirectory}/package.json", "${normalizedRootDirectory}/package-lock.json", "./"]

RUN npm ci

COPY ["${normalizedRootDirectory}/", "./"]

RUN npm run build

FROM nginx:1.27-alpine AS runner

RUN printf 'server {\\n\\
    listen 80;\\n\\
    listen [::]:80;\\n\\
    server_name _;\\n\\
    root /usr/share/nginx/html;\\n\\
    index index.html;\\n\\
    location / {\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }\\n\\
    location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|webp)$ {\\n\\
        expires 1y;\\n\\
        add_header Cache-Control "public, immutable";\\n\\
        try_files $uri =404;\\n\\
    }\\n\\
}' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
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
