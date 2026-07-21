import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Injectable, Logger } from "@nestjs/common";
import { DeploymentStatus } from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";

const execFileAsync = promisify(execFile);

export type DockerContainerResult = {
  containerId: string;
  assignedPort: number;
  liveUrl: string;
};

@Injectable()
export class DockerContainerService {
  private readonly logger = new Logger(DockerContainerService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async start(
    deploymentId: string,
    imageTag: string,
    applicationPort: number,
  ): Promise<DockerContainerResult> {
    const containerName = this.createContainerName(deploymentId);

    await this.prismaService.client.deployment.update({
      where: {
        id: deploymentId,
      },
      data: {
        status: DeploymentStatus.STARTING,
        containerId: null,
        assignedPort: null,
        liveUrl: null,
      },
    });

    this.logger.log(`Deployment ${deploymentId} changed to STARTING`);

    try {
      const containerId = await this.runDocker([
        "run",
        "--detach",
        "--name",
        containerName,
        "--publish",
        `127.0.0.1::${applicationPort}`,
        imageTag,
      ]);

      const assignedPort = await this.getAssignedPort(
        containerId,
        applicationPort,
      );

      const liveUrl = `http://localhost:${assignedPort}`;

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: DeploymentStatus.HEALTH_CHECKING,
          containerId,
          assignedPort,
          liveUrl,
        },
      });

      this.logger.log(`Container started: ${containerId}`);
      this.logger.log(`Deployment available at ${liveUrl}`);
      this.logger.log(`Deployment ${deploymentId} changed to HEALTH_CHECKING`);

      await this.waitUntilHealthy(containerId, liveUrl);

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: DeploymentStatus.READY,
          finishedAt: new Date(),
        },
      });

      this.logger.log(`Deployment ${deploymentId} changed to READY`);

      return {
        containerId,
        assignedPort,
        liveUrl,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Docker container error";

      await this.removeContainer(containerName);

      throw new Error(`Docker container startup failed: ${message}`, {
        cause: error,
      });
    }
  }

  async stop(deploymentId: string, containerId: string): Promise<void> {
    this.logger.log(
      `Stopping container ${containerId} for deployment ${deploymentId}`,
    );

    try {
      await this.runDocker(["rm", "--force", containerId]);
    } catch (error: unknown) {
      const exists = await this.containerExists(containerId);

      if (exists) {
        throw error;
      }

      this.logger.warn(`Container ${containerId} no longer exists; continuing`);
    }

    await this.prismaService.client.deployment.update({
      where: {
        id: deploymentId,
      },
      data: {
        status: DeploymentStatus.STOPPED,
        containerId: null,
        assignedPort: null,
        liveUrl: null,
        finishedAt: new Date(),
      },
    });

    this.logger.log(`Deployment ${deploymentId} changed to STOPPED`);
  }

  private async containerExists(containerId: string): Promise<boolean> {
    try {
      await this.runDocker(["inspect", containerId]);

      return true;
    } catch {
      return false;
    }
  }

  private async getAssignedPort(
    containerId: string,
    applicationPort: number,
  ): Promise<number> {
    const output = await this.runDocker([
      "port",
      containerId,
      `${applicationPort}/tcp`,
    ]);

    const match = output.match(/:(\d+)\s*$/);

    if (!match) {
      throw new Error(
        `Docker did not assign a host port for container port ${applicationPort}`,
      );
    }

    const assignedPort = Number(match[1]);

    if (!Number.isInteger(assignedPort) || assignedPort <= 0) {
      throw new Error(`Docker returned an invalid host port: ${match[1]}`);
    }

    return assignedPort;
  }

  private async waitUntilHealthy(
    containerId: string,
    liveUrl: string,
  ): Promise<void> {
    const maximumAttempts = 30;
    const delayMilliseconds = 2_000;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const isRunning = await this.isContainerRunning(containerId);

      if (!isRunning) {
        const logs = await this.getContainerLogs(containerId);

        throw new Error(
          logs
            ? `Container stopped unexpectedly. Logs: ${logs}`
            : "Container stopped unexpectedly",
        );
      }

      try {
        const response = await fetch(liveUrl, {
          signal: AbortSignal.timeout(3_000),
        });

        if (response.ok) {
          this.logger.log(`Health check succeeded on attempt ${attempt}`);

          return;
        }

        this.logger.warn(
          `Health check attempt ${attempt} returned HTTP ${response.status}`,
        );
      } catch {
        this.logger.warn(
          `Health check attempt ${attempt}/${maximumAttempts} failed`,
        );
      }

      await this.delay(delayMilliseconds);
    }

    throw new Error(
      `Application did not become healthy within ${
        (maximumAttempts * delayMilliseconds) / 1_000
      } seconds`,
    );
  }

  private async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const result = await this.runDocker([
        "inspect",
        "--format",
        "{{.State.Running}}",
        containerId,
      ]);

      return result === "true";
    } catch {
      return false;
    }
  }

  private async getContainerLogs(containerId: string): Promise<string> {
    try {
      return await this.runDocker(["logs", "--tail", "50", containerId]);
    } catch {
      return "";
    }
  }

  private async removeContainer(containerName: string): Promise<void> {
    try {
      await this.runDocker(["rm", "--force", containerName]);
    } catch {
      // The container may not have been created.
    }
  }

  private createContainerName(deploymentId: string): string {
    const normalizedId = deploymentId
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-");

    return `devpilot-${normalizedId}`;
  }

  private async runDocker(args: string[]): Promise<string> {
    try {
      const result = await execFileAsync("docker", args, {
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });

      return String(result.stdout).trim();
    } catch (error: unknown) {
      const message = this.extractDockerError(error);

      throw new Error(`Docker command failed: ${message}`, {
        cause: error,
      });
    }
  }

  private extractDockerError(error: unknown): string {
    if (!this.isRecord(error)) {
      return error instanceof Error ? error.message : "Unknown Docker error";
    }

    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";

    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";

    const message = typeof error.message === "string" ? error.message : "";

    return stderr || stdout || message || "Unknown Docker error";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
