import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeploymentLogLevel, DeploymentStatus } from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";
import { DockerContainerService } from "../docker/docker-container.service.js";

@Injectable()
export class ContainerReconciliationService {
  private readonly logger = new Logger(ContainerReconciliationService.name);

  private reconciliationInProgress = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly dockerContainerService: DockerContainerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileContainers(): Promise<void> {
    if (this.reconciliationInProgress) {
      this.logger.warn(
        "Skipping container reconciliation because the previous run is still active",
      );

      return;
    }

    this.reconciliationInProgress = true;

    try {
      const deployments = await this.prismaService.client.deployment.findMany({
        where: {
          status: DeploymentStatus.READY,
          containerId: {
            not: null,
          },
        },
        include: {
          analysis: {
            select: {
              applicationPort: true,
            },
          },
        },
      });

      if (deployments.length === 0) {
        return;
      }

      this.logger.log(
        `Reconciling ${deployments.length} READY deployment container(s)`,
      );

      for (const deployment of deployments) {
        try {
          if (!deployment.containerId) {
            continue;
          }

          const applicationPort = deployment.analysis?.applicationPort ?? 3000;

          const containerState =
            await this.dockerContainerService.inspectContainer(
              deployment.containerId,
              applicationPort,
            );

          if (!containerState.exists) {
            await this.markDeploymentFailed(
              deployment.id,
              deployment.containerId,
              "CONTAINER_NOT_FOUND",
              "The Docker container no longer exists",
            );

            continue;
          }

          if (!containerState.running) {
            await this.markDeploymentFailed(
              deployment.id,
              deployment.containerId,
              "CONTAINER_NOT_RUNNING",
              "The Docker container stopped unexpectedly",
            );

            continue;
          }

          if (containerState.assignedPort === null) {
            await this.markDeploymentFailed(
              deployment.id,
              deployment.containerId,
              "CONTAINER_PORT_NOT_FOUND",
              `Docker did not report a host port for container port ${applicationPort}`,
            );

            continue;
          }

          const actualPort = containerState.assignedPort;
          const actualLiveUrl = `http://localhost:${actualPort}`;

          const portChanged =
            deployment.assignedPort !== actualPort ||
            deployment.liveUrl !== actualLiveUrl;

          if (!portChanged) {
            continue;
          }

          const update = await this.prismaService.client.deployment.updateMany({
            where: {
              id: deployment.id,
              status: DeploymentStatus.READY,
              containerId: deployment.containerId,
            },
            data: {
              assignedPort: actualPort,
              liveUrl: actualLiveUrl,
              errorCode: null,
              errorMessage: null,
            },
          });

          if (update.count === 0) {
            continue;
          }

          await this.appendReconciliationLog(
            deployment.id,
            DeploymentLogLevel.INFO,
            `Container port synchronized from ${
              deployment.assignedPort ?? "unknown"
            } to ${actualPort}. Live URL: ${actualLiveUrl}`,
          );

          this.logger.log(
            `Deployment ${deployment.id} synchronized to ${actualLiveUrl}`,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown reconciliation error";

          this.logger.error(
            `Could not reconcile deployment ${deployment.id}: ${message}`,
          );
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown container reconciliation error";

      this.logger.error(`Container reconciliation failed: ${message}`);
    } finally {
      this.reconciliationInProgress = false;
    }
  }

  private async markDeploymentFailed(
    deploymentId: string,
    containerId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const update = await this.prismaService.client.deployment.updateMany({
      where: {
        id: deploymentId,
        status: DeploymentStatus.READY,
        containerId,
      },
      data: {
        status: DeploymentStatus.FAILED,
        containerId: null,
        assignedPort: null,
        liveUrl: null,
        errorCode,
        errorMessage,
        finishedAt: new Date(),
      },
    });

    if (update.count === 0) {
      return;
    }

    await this.appendReconciliationLog(
      deploymentId,
      DeploymentLogLevel.ERROR,
      errorMessage,
    );

    this.logger.warn(
      `Deployment ${deploymentId} changed from READY to FAILED: ${errorMessage}`,
    );
  }

  private async appendReconciliationLog(
    deploymentId: string,
    level: DeploymentLogLevel,
    message: string,
  ): Promise<void> {
    try {
      await this.prismaService.client.deploymentLog.create({
        data: {
          deploymentId,
          level,
          stage: "RECONCILIATION",
          message,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown deployment-log persistence error";

      this.logger.error(
        `Could not save reconciliation log for deployment ${deploymentId}: ${errorMessage}`,
      );
    }
  }
}
