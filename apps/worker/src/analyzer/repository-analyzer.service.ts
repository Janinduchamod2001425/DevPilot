import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Injectable } from "@nestjs/common";

type PackageManager = "npm" | "pnpm" | "yarn";

export type RepositoryAnalysis = {
  projectType: string;
  framework: string;
  packageManager: PackageManager;
  installCommand: string;
  buildCommand: string | null;
  startCommand: string | null;
  applicationPort: number | null;
  hasDockerfile: boolean;
  rootDirectory: string;
  warnings: string[];
};

type PackageJson = {
  packageManager?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
};

@Injectable()
export class RepositoryAnalyzerService {
  async analyze(
    workspacePath: string,
    rootDirectory: string,
  ): Promise<RepositoryAnalysis> {
    const projectPath = this.resolveProjectPath(workspacePath, rootDirectory);

    const packageJsonPath = join(projectPath, "package.json");

    const packageJson = await this.readPackageJson(packageJsonPath);

    const warnings: string[] = [];

    if (rootDirectory !== ".") {
      warnings.push(`Selected monorepo application: ${rootDirectory}`);
    }

    const packageManager = await this.detectPackageManager(
      workspacePath,
      projectPath,
      packageJson,
      warnings,
    );

    const scripts = this.toStringRecord(packageJson.scripts);

    const dependencies = {
      ...this.toStringRecord(packageJson.dependencies),

      ...this.toStringRecord(packageJson.devDependencies),
    };

    const detectedProject = this.detectProject(dependencies, warnings);

    const hasDockerfile = await this.fileExists(
      join(projectPath, "Dockerfile"),
    );

    const buildCommand = scripts.build ? `${packageManager} run build` : null;

    const startCommand = this.determineStartCommand(
      packageManager,
      scripts,
      detectedProject.framework,
    );

    if (!buildCommand) {
      warnings.push(
        `No build script was found in ${rootDirectory}/package.json`,
      );
    }

    if (!startCommand) {
      warnings.push(
        `No start command could be determined for ${rootDirectory}`,
      );
    }

    if (!hasDockerfile) {
      warnings.push(`No Dockerfile was found in ${rootDirectory}`);
    }

    return {
      projectType: detectedProject.projectType,
      framework: detectedProject.framework,
      packageManager,
      installCommand: this.getInstallCommand(packageManager),
      buildCommand,
      startCommand,
      applicationPort: detectedProject.applicationPort,
      hasDockerfile,
      rootDirectory,
      warnings,
    };
  }

  private resolveProjectPath(
    workspacePath: string,
    rootDirectory: string,
  ): string {
    if (!rootDirectory.trim()) {
      throw new Error("Project root directory cannot be empty");
    }

    const projectPath = resolve(workspacePath, rootDirectory);

    const relativePath = relative(workspacePath, projectPath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(
        "Project root directory escaped the repository workspace",
      );
    }

    return projectPath;
  }

  private async readPackageJson(packageJsonPath: string): Promise<PackageJson> {
    let fileStats;

    try {
      fileStats = await stat(packageJsonPath);
    } catch {
      throw new Error(`No package.json was found at ${packageJsonPath}`);
    }

    if (fileStats.size > 1_000_000) {
      throw new Error("package.json exceeds the permitted size");
    }

    const content = await readFile(packageJsonPath, "utf8");

    let parsed: unknown;

    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new Error("package.json contains invalid JSON");
    }

    if (!this.isRecord(parsed)) {
      throw new Error("package.json must contain a JSON object");
    }

    return parsed;
  }

  private async detectPackageManager(
    workspacePath: string,
    projectPath: string,
    packageJson: PackageJson,
    warnings: string[],
  ): Promise<PackageManager> {
    const searchPaths =
      workspacePath === projectPath
        ? [workspacePath]
        : [projectPath, workspacePath];

    const lockfiles = {
      pnpm: await this.fileExistsInAny(searchPaths, "pnpm-lock.yaml"),

      yarn: await this.fileExistsInAny(searchPaths, "yarn.lock"),

      npm: await this.fileExistsInAny(searchPaths, "package-lock.json"),
    };

    const detected = Object.entries(lockfiles)
      .filter(([, exists]) => exists)
      .map(([name]) => name as PackageManager);

    if (detected.length > 1) {
      warnings.push(`Multiple lockfile types detected: ${detected.join(", ")}`);
    }

    if (detected.length > 0) {
      return detected[0];
    }

    if (typeof packageJson.packageManager === "string") {
      if (packageJson.packageManager.startsWith("pnpm@")) {
        return "pnpm";
      }

      if (packageJson.packageManager.startsWith("yarn@")) {
        return "yarn";
      }

      if (packageJson.packageManager.startsWith("npm@")) {
        return "npm";
      }
    }

    warnings.push(
      "No recognized lockfile was found; npm was selected as the fallback",
    );

    return "npm";
  }

  private detectProject(
    dependencies: Record<string, string>,
    warnings: string[],
  ): {
    projectType: string;
    framework: string;
    applicationPort: number | null;
  } {
    const has = (name: string): boolean =>
      typeof dependencies[name] === "string";

    if (has("next")) {
      return {
        projectType: "fullstack",
        framework: "Next.js",
        applicationPort: 3000,
      };
    }

    if (has("nuxt")) {
      return {
        projectType: "fullstack",
        framework: "Nuxt.js",
        applicationPort: 3000,
      };
    }

    if (has("@nestjs/core")) {
      return {
        projectType: "backend",
        framework: "NestJS",
        applicationPort: 3000,
      };
    }

    if (has("express")) {
      return {
        projectType: "backend",
        framework: "Express.js",
        applicationPort: 3000,
      };
    }

    if (has("vite") && has("react")) {
      return {
        projectType: "frontend",
        framework: "React with Vite",
        applicationPort: null,
      };
    }

    if (has("vite") && has("vue")) {
      return {
        projectType: "frontend",
        framework: "Vue with Vite",
        applicationPort: null,
      };
    }

    warnings.push("The repository framework could not be identified");

    return {
      projectType: "unknown",
      framework: "Unknown",
      applicationPort: null,
    };
  }

  private determineStartCommand(
    packageManager: PackageManager,
    scripts: Record<string, string>,
    framework: string,
  ): string | null {
    if (scripts.start) {
      return `${packageManager} run start`;
    }

    if (framework === "Nuxt.js") {
      return "node .output/server/index.mjs";
    }

    return null;
  }

  private getInstallCommand(packageManager: PackageManager): string {
    if (packageManager === "pnpm") {
      return "pnpm install --frozen-lockfile";
    }

    if (packageManager === "yarn") {
      return "yarn install --frozen-lockfile";
    }

    return "npm ci";
  }

  private async fileExistsInAny(
    directories: string[],
    filename: string,
  ): Promise<boolean> {
    for (const directory of directories) {
      if (await this.fileExists(join(directory, filename))) {
        return true;
      }
    }

    return false;
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
