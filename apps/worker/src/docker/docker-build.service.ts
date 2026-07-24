import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Injectable, Logger } from "@nestjs/common";
import { DeploymentLogLevel, DeploymentStatus } from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";
import type { DockerfileResult } from "./dockerfile.service.js";

export type DockerBuildResult = {
  imageTag: string;
};

const DOCKER_BUILD_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_LOG_MESSAGE_LENGTH = 10_000;

const ANSI_ESCAPE_CHARACTER = String.fromCharCode(27);

const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `${ANSI_ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

@Injectable()
export class DockerBuildService {
  private readonly logger = new Logger(DockerBuildService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async build(
    deploymentId: string,
    dockerfile: DockerfileResult,
  ): Promise<DockerBuildResult> {
    const imageTag = this.createImageTag(deploymentId);

    await this.prismaService.client.deployment.update({
      where: {
        id: deploymentId,
      },
      data: {
        status: DeploymentStatus.BUILDING,
        imageTag: null,
      },
    });

    await this.appendBuildLog(
      deploymentId,
      `Building Docker image ${imageTag}`,
    );

    this.logger.log(`Deployment ${deploymentId} changed to BUILDING`);
    this.logger.log(`Building Docker image: ${imageTag}`);

    try {
      await this.executeDockerBuild(deploymentId, dockerfile, imageTag);

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          imageTag,
        },
      });

      await this.appendBuildLog(
        deploymentId,
        `Docker image built successfully: ${imageTag}`,
      );

      this.logger.log(`Docker image successfully built: ${imageTag}`);

      return {
        imageTag,
      };
    } catch (error: unknown) {
      const message = this.extractBuildError(error);

      await this.appendBuildLog(
        deploymentId,
        `Docker image build failed: ${message}`,
        DeploymentLogLevel.ERROR,
      );

      throw new Error(`Docker image build failed: ${message}`, {
        cause: error,
      });
    }
  }

  private async executeDockerBuild(
    deploymentId: string,
    dockerfile: DockerfileResult,
    imageTag: string,
  ): Promise<void> {
    const dockerArguments = [
      "build",
      "--progress=plain",
      "--file",
      dockerfile.dockerfilePath,
      "--tag",
      imageTag,
      dockerfile.buildContextPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const dockerProcess = spawn("docker", dockerArguments, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let settled = false;
      let lastOutputLine = "";

      const stdoutReader = createInterface({
        input: dockerProcess.stdout,
      });

      const stderrReader = createInterface({
        input: dockerProcess.stderr,
      });

      /*
       * Docker BuildKit commonly writes normal progress output to stderr,
       * so stderr lines are stored as INFO unless the process exits with
       * a non-zero exit code.
       */
      const handleOutputLine = (line: string): void => {
        const normalizedLine = line.trim();

        if (!normalizedLine) {
          return;
        }

        lastOutputLine = normalizedLine;
        this.logger.debug(normalizedLine);

        void this.appendBuildLog(deploymentId, normalizedLine);
      };

      stdoutReader.on("line", handleOutputLine);
      stderrReader.on("line", handleOutputLine);

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        dockerProcess.kill();

        stdoutReader.close();
        stderrReader.close();

        reject(
          new Error(
            `Docker build exceeded the ${
              DOCKER_BUILD_TIMEOUT_MS / 60_000
            } minute timeout`,
          ),
        );
      }, DOCKER_BUILD_TIMEOUT_MS);

      dockerProcess.once("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        stdoutReader.close();
        stderrReader.close();

        reject(error);
      });

      dockerProcess.once("close", (exitCode, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        stdoutReader.close();
        stderrReader.close();

        if (exitCode === 0) {
          resolve();
          return;
        }

        const reason =
          lastOutputLine ||
          (signal
            ? `Docker build was terminated by signal ${signal}`
            : `Docker exited with code ${exitCode ?? "unknown"}`);

        reject(new Error(reason));
      });
    });
  }

  private async appendBuildLog(
    deploymentId: string,
    message: string,
    level: DeploymentLogLevel = DeploymentLogLevel.INFO,
  ): Promise<void> {
    const normalizedMessage = message
      .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "")
      .trim()
      .slice(0, MAX_LOG_MESSAGE_LENGTH);

    if (!normalizedMessage) {
      return;
    }

    try {
      await this.prismaService.client.deploymentLog.create({
        data: {
          deploymentId,
          level,
          stage: "BUILDING",
          message: normalizedMessage,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown deployment-log persistence error";

      this.logger.error(
        `Could not persist Docker output for deployment ${deploymentId}: ${errorMessage}`,
      );
    }
  }

  private createImageTag(deploymentId: string): string {
    const normalizedId = deploymentId
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-");

    return `devpilot-deployment:${normalizedId}`;
  }

  private extractBuildError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown Docker build error";
  }
}
