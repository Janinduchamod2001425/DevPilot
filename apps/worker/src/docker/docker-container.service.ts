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

export type DockerContainerState = {
  exists: boolean;
  running: boolean;
  assignedPort: number | null;
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

    /*
     * A failed deployment may leave behind a stopped container with this
     * deterministic name. Remove only stopped orphaned containers.
     */
    await this.prepareContainerName(containerName);

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

    let createdContainerId: string | null = null;

    try {
      createdContainerId = await this.runDocker([
        "run",
        "--detach",
        "--restart",
        "unless-stopped",
        "--name",
        containerName,
        "--publish",
        `127.0.0.1::${applicationPort}`,
        imageTag,
      ]);

      const assignedPort = await this.getAssignedPort(
        createdContainerId,
        applicationPort,
      );

      const liveUrl = `http://127.0.0.1:${assignedPort}`;

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: DeploymentStatus.HEALTH_CHECKING,
          containerId: createdContainerId,
          assignedPort,
          liveUrl,
        },
      });

      this.logger.log(`Container started: ${createdContainerId}`);
      this.logger.log(`Deployment available at ${liveUrl}`);
      this.logger.log(`Deployment ${deploymentId} changed to HEALTH_CHECKING`);

      await this.waitUntilHealthy(createdContainerId, applicationPort, liveUrl);

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
        containerId: createdContainerId,
        assignedPort,
        liveUrl,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Docker container error";

      /*
       * Remove only the container created by this start attempt. Never
       * remove a pre-existing running container after a name conflict.
       */
      if (createdContainerId) {
        await this.removeContainer(createdContainerId);
      }

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

  async inspectContainer(
    containerId: string,
    applicationPort: number,
  ): Promise<DockerContainerState> {
    const exists = await this.containerExists(containerId);

    if (!exists) {
      return {
        exists: false,
        running: false,
        assignedPort: null,
      };
    }

    const running = await this.isContainerRunning(containerId);

    if (!running) {
      return {
        exists: true,
        running: false,
        assignedPort: null,
      };
    }

    try {
      const assignedPort = await this.getAssignedPort(
        containerId,
        applicationPort,
      );

      return {
        exists: true,
        running: true,
        assignedPort,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Docker port error";

      this.logger.warn(
        `Could not resolve the assigned port for container ${containerId}: ${message}`,
      );

      return {
        exists: true,
        running: true,
        assignedPort: null,
      };
    }
  }

  private async prepareContainerName(containerName: string): Promise<void> {
    const exists = await this.containerExists(containerName);

    if (!exists) {
      return;
    }

    const running = await this.isContainerRunning(containerName);

    if (running) {
      throw new Error(
        `Docker container ${containerName} already exists and is running`,
      );
    }

    this.logger.warn(
      `Removing stopped orphaned container ${containerName} before startup`,
    );

    await this.runDocker(["rm", "--force", containerName]);

    const stillExists = await this.containerExists(containerName);

    if (stillExists) {
      throw new Error(
        `Stopped Docker container ${containerName} could not be removed`,
      );
    }

    this.logger.log(`Removed stopped orphaned container ${containerName}`);
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
    applicationPort: number,
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

      /*
       * Check the application from inside the container.
       * This avoids Docker Desktop host-port forwarding delays.
       *
       * Alpine-based Node and Nginx images provide BusyBox wget.
       */
      const internallyHealthy = await this.checkContainerHealth(
        containerId,
        applicationPort,
      );

      if (internallyHealthy) {
        this.logger.log(
          `Internal container health check succeeded on attempt ${attempt}`,
        );

        /*
         * The application is running. Test the published address as an
         * additional check, but do not incorrectly fail the deployment
         * because of a temporary Docker Desktop forwarding delay.
         */
        const hostReachable = await this.checkPublishedHealth(liveUrl);

        if (hostReachable) {
          this.logger.log(`Published health check succeeded at ${liveUrl}`);
        } else {
          this.logger.warn(
            `Application is healthy inside the container, but ${liveUrl} is not reachable yet`,
          );
        }

        return;
      }

      const logs = await this.getContainerLogs(containerId);

      this.logger.warn(
        `Health check attempt ${attempt}/${maximumAttempts} failed${
          logs ? `. Recent container logs: ${logs}` : ""
        }`,
      );

      if (attempt < maximumAttempts) {
        await this.delay(delayMilliseconds);
      }
    }

    const finalLogs = await this.getContainerLogs(containerId);

    throw new Error(
      `Application did not become healthy within 60 seconds${
        finalLogs ? `. Container logs: ${finalLogs}` : ""
      }`,
    );
  }

  private async checkContainerHealth(
    containerId: string,
    applicationPort: number,
  ): Promise<boolean> {
    try {
      await this.runDocker([
        "exec",
        containerId,
        "wget",
        "--quiet",
        "--spider",
        "--timeout=3",
        `http://127.0.0.1:${applicationPort}/`,
      ]);

      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown internal health-check error";

      this.logger.debug(
        `Internal health check failed for container ${containerId}: ${message}`,
      );

      return false;
    }
  }

  private async checkPublishedHealth(liveUrl: string): Promise<boolean> {
    try {
      const response = await fetch(liveUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(3_000),
      });

      return response.status >= 200 && response.status < 400;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown published health-check error";

      this.logger.debug(
        `Published health check failed for ${liveUrl}: ${message}`,
      );

      return false;
    }
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
