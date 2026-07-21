import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Injectable, Logger } from "@nestjs/common";
import { DeploymentStatus } from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";
import type { DockerfileResult } from "./dockerfile.service.js";

const execFileAsync = promisify(execFile);

export type DockerBuildResult = {
  imageTag: string;
};

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

    this.logger.log(`Deployment ${deploymentId} changed to BUILDING`);

    this.logger.log(`Building Docker image: ${imageTag}`);

    try {
      const result = await execFileAsync(
        "docker",
        [
          "build",
          "--file",
          dockerfile.dockerfilePath,
          "--tag",
          imageTag,
          dockerfile.buildContextPath,
        ],
        {
          encoding: "utf8",
          timeout: 15 * 60 * 1000,
          maxBuffer: 20 * 1024 * 1024,
          windowsHide: true,
        },
      );

      const buildOutput = [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();

      if (buildOutput) {
        this.logger.debug(buildOutput);
      }

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          imageTag,
        },
      });

      this.logger.log(`Docker image successfully built: ${imageTag}`);

      return {
        imageTag,
      };
    } catch (error: unknown) {
      const message = this.extractBuildError(error);

      throw new Error(`Docker image build failed: ${message}`, {
        cause: error,
      });
    }
  }

  private createImageTag(deploymentId: string): string {
    const normalizedId = deploymentId
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-");

    return `devpilot-deployment:${normalizedId}`;
  }

  private extractBuildError(error: unknown): string {
    if (!this.isRecord(error)) {
      return error instanceof Error
        ? error.message
        : "Unknown Docker build error";
    }

    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";

    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";

    const message = typeof error.message === "string" ? error.message : "";

    return stderr || stdout || message || "Unknown Docker build error";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
