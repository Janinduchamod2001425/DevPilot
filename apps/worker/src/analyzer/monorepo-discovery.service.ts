import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Injectable } from "@nestjs/common";

export type DiscoveredApplication = {
  name: string;
  rootDirectory: string;
  framework: string;
  projectType: string;
  hasBuildScript: boolean;
  hasStartScript: boolean;
  hasDockerfile: boolean;
};

type PackageJson = {
  name?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
};

@Injectable()
export class MonorepoDiscoveryService {
  private readonly conventionalDirectories = ["apps", "packages", "services"];

  async discover(workspacePath: string): Promise<DiscoveredApplication[]> {
    const candidateDirectories =
      await this.collectCandidateDirectories(workspacePath);

    const discovered: DiscoveredApplication[] = [];

    for (const candidatePath of candidateDirectories) {
      const application = await this.inspectCandidate(
        workspacePath,
        candidatePath,
      );

      if (application) {
        discovered.push(application);
      }
    }

    return discovered.sort((first, second) =>
      first.rootDirectory.localeCompare(second.rootDirectory),
    );
  }

  private async collectCandidateDirectories(
    workspacePath: string,
  ): Promise<string[]> {
    const candidates = [workspacePath];

    for (const directoryName of this.conventionalDirectories) {
      const containerPath = join(workspacePath, directoryName);

      let entries;

      try {
        entries = await readdir(containerPath, {
          withFileTypes: true,
        });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        candidates.push(join(containerPath, entry.name));

        if (candidates.length >= 100) {
          return candidates;
        }
      }
    }

    return candidates;
  }

  private async inspectCandidate(
    workspacePath: string,
    candidatePath: string,
  ): Promise<DiscoveredApplication | null> {
    const packageJson = await this.readPackageJson(
      join(candidatePath, "package.json"),
    );

    if (!packageJson) {
      return null;
    }

    const scripts = this.toStringRecord(packageJson.scripts);

    const dependencies = {
      ...this.toStringRecord(packageJson.dependencies),

      ...this.toStringRecord(packageJson.devDependencies),
    };

    const detectedProject = this.detectProject(dependencies);

    const hasStartScript = typeof scripts.start === "string";

    /*
     * Unknown packages without a start script are usually
     * shared libraries, configuration packages or tooling.
     */
    if (detectedProject.framework === "Unknown" && !hasStartScript) {
      return null;
    }

    const relativeDirectory = relative(workspacePath, candidatePath);

    const rootDirectory = relativeDirectory
      ? relativeDirectory.split(sep).join("/")
      : ".";

    return {
      name:
        typeof packageJson.name === "string" ? packageJson.name : rootDirectory,

      rootDirectory,
      framework: detectedProject.framework,
      projectType: detectedProject.projectType,

      hasBuildScript: typeof scripts.build === "string",

      hasStartScript,

      hasDockerfile: await this.fileExists(join(candidatePath, "Dockerfile")),
    };
  }

  private async readPackageJson(
    packageJsonPath: string,
  ): Promise<PackageJson | null> {
    let fileStats;

    try {
      fileStats = await stat(packageJsonPath);
    } catch {
      return null;
    }

    if (fileStats.size > 1_000_000) {
      return null;
    }

    try {
      const content = await readFile(packageJsonPath, "utf8");

      const parsed: unknown = JSON.parse(content) as unknown;

      if (!this.isRecord(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private detectProject(dependencies: Record<string, string>): {
    framework: string;
    projectType: string;
  } {
    const has = (name: string): boolean =>
      typeof dependencies[name] === "string";

    if (has("next")) {
      return {
        framework: "Next.js",
        projectType: "fullstack",
      };
    }

    if (has("nuxt")) {
      return {
        framework: "Nuxt.js",
        projectType: "fullstack",
      };
    }

    if (has("@nestjs/core")) {
      return {
        framework: "NestJS",
        projectType: "backend",
      };
    }

    if (has("express")) {
      return {
        framework: "Express.js",
        projectType: "backend",
      };
    }

    if (has("fastify")) {
      return {
        framework: "Fastify",
        projectType: "backend",
      };
    }

    if (has("vite") && has("react")) {
      return {
        framework: "React with Vite",
        projectType: "frontend",
      };
    }

    if (has("vite") && has("vue")) {
      return {
        framework: "Vue with Vite",
        projectType: "frontend",
      };
    }

    return {
      framework: "Unknown",
      projectType: "unknown",
    };
  }

  private toStringRecord(value: unknown): Record<string, string> {
    if (!this.isRecord(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
