import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  DeploymentStatus,
  type Deployment,
  type DeploymentAnalysis,
  type DeploymentLog,
} from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";
import { DeploymentQueueService } from "../deployment-queue/deployment-queue.service.js";
import { CreateDeploymentDto } from "./dto/create-deployment.dto.js";

const ACTIVE_DEPLOYMENT_STATUSES: DeploymentStatus[] = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.CLONING,
  DeploymentStatus.ANALYZING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.STARTING,
  DeploymentStatus.HEALTH_CHECKING,
];

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deploymentQueueService: DeploymentQueueService,
  ) {}

  async create(userId: string, dto: CreateDeploymentDto): Promise<Deployment> {
    // The project must belong to the currently authenticated user.
    const project = await this.prismaService.client.project.findFirst({
      where: {
        id: dto.projectId,
        userId,
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const deployment = await this.prismaService.client.$transaction(
      async (prisma) => {
        const createdDeployment = await prisma.deployment.create({
          data: {
            projectId: project.id,
            branch: project.productionBranch,
            status: DeploymentStatus.QUEUED,
          },
        });

        await prisma.deploymentLog.create({
          data: {
            deploymentId: createdDeployment.id,
            level: "INFO",
            stage: "QUEUE",
            message: `Deployment queued for ${project.repositoryOwner}/${project.repositoryName} on branch ${project.productionBranch}`,
          },
        });

        return createdDeployment;
      },
    );

    try {
      await this.deploymentQueueService.addDeployment({
        deploymentId: deployment.id,
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        branch: project.productionBranch,
        rootDirectory: project.rootDirectory,
        requestedAt: new Date().toISOString(),
      });

      return deployment;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown queue error";

      await this.prismaService.client.$transaction([
        this.prismaService.client.deployment.update({
          where: {
            id: deployment.id,
          },
          data: {
            status: DeploymentStatus.FAILED,
            errorCode: "QUEUE_PUBLISH_FAILED",
            errorMessage: message,
            finishedAt: new Date(),
          },
        }),

        this.prismaService.client.deploymentLog.create({
          data: {
            deploymentId: deployment.id,
            level: "ERROR",
            stage: "QUEUE",
            message: `Failed to publish deployment job: ${message}`,
          },
        }),
      ]);

      throw new ServiceUnavailableException(
        "The deployment was created, but it could not be queued",
      );
    }
  }

  async findOne(userId: string, id: string): Promise<Deployment> {
    return this.requireOwnedDeployment(userId, id);
  }

  async findAnalysis(
    userId: string,
    deploymentId: string,
  ): Promise<DeploymentAnalysis> {
    // Verify ownership before exposing deployment analysis.
    await this.requireOwnedDeployment(userId, deploymentId);

    const analysis =
      await this.prismaService.client.deploymentAnalysis.findUnique({
        where: {
          deploymentId,
        },
      });

    if (!analysis) {
      throw new NotFoundException(
        `Analysis for deployment ${deploymentId} was not found`,
      );
    }

    return analysis;
  }

  async findLogs(
    userId: string,
    deploymentId: string,
  ): Promise<DeploymentLog[]> {
    // Verify ownership before exposing deployment logs.
    await this.requireOwnedDeployment(userId, deploymentId);

    return this.prismaService.client.deploymentLog.findMany({
      where: {
        deploymentId,
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });
  }

  async stop(userId: string, id: string): Promise<Deployment> {
    // Only the owner can stop this deployment.
    const deployment = await this.requireOwnedDeployment(userId, id);

    if (deployment.status === DeploymentStatus.STOPPED) {
      throw new ConflictException(`Deployment ${id} is already stopped`);
    }

    if (deployment.status !== DeploymentStatus.READY) {
      throw new ConflictException(
        `Only READY deployments can be stopped. Current status: ${deployment.status}`,
      );
    }

    if (!deployment.containerId) {
      throw new ConflictException(`Deployment ${id} does not have a container`);
    }

    try {
      await this.deploymentQueueService.addStopDeployment({
        deploymentId: deployment.id,
        containerId: deployment.containerId,
        requestedAt: new Date().toISOString(),
      });

      return deployment;
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        "The stop request could not be queued",
        {
          cause: error,
        },
      );
    }
  }

  async restart(userId: string, id: string): Promise<Deployment> {
    /*
     * This query performs the ownership check and includes the deployment
     * analysis required for determining the application port.
     */
    const deployment = await this.prismaService.client.deployment.findFirst({
      where: {
        id,
        project: {
          userId,
        },
      },
      include: {
        analysis: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException("Deployment not found");
    }

    const restartableStatuses: DeploymentStatus[] = [
      DeploymentStatus.STOPPED,
      DeploymentStatus.FAILED,
    ];

    if (!restartableStatuses.includes(deployment.status)) {
      throw new ConflictException(
        `Only STOPPED or FAILED deployments can be restarted. Current status: ${deployment.status}`,
      );
    }

    if (!deployment.imageTag) {
      throw new ConflictException(
        `Deployment ${id} does not have a reusable Docker image. Create a new deployment instead.`,
      );
    }

    if (!deployment.analysis) {
      throw new ConflictException(
        `Deployment ${id} does not have deployment analysis`,
      );
    }

    const previousStatus = deployment.status;
    const applicationPort = deployment.analysis.applicationPort ?? 3000;

    /*
     * The conditional update ensures that simultaneous restart requests
     * cannot both be accepted.
     */
    const transition = await this.prismaService.client.deployment.updateMany({
      where: {
        id,
        status: previousStatus,
      },
      data: {
        status: DeploymentStatus.STARTING,
        startedAt: new Date(),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        containerId: null,
        assignedPort: null,
        liveUrl: null,
      },
    });

    if (transition.count !== 1) {
      throw new ConflictException(
        `Deployment ${id} is already being restarted`,
      );
    }

    try {
      await this.deploymentQueueService.addRestartDeployment({
        deploymentId: deployment.id,
        imageTag: deployment.imageTag,
        applicationPort,
        requestedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown queue error";

      /*
       * Restore the previous deployment status when Redis cannot
       * accept the restart job.
       */
      await this.prismaService.client.$transaction([
        this.prismaService.client.deployment.updateMany({
          where: {
            id,
            status: DeploymentStatus.STARTING,
            containerId: null,
          },
          data: {
            status: previousStatus,
            errorCode: "RESTART_QUEUE_PUBLISH_FAILED",
            errorMessage: message,
            finishedAt: new Date(),
          },
        }),

        this.prismaService.client.deploymentLog.create({
          data: {
            deploymentId: id,
            level: "ERROR",
            stage: "RESTART",
            message: `Failed to publish restart job: ${message}`,
          },
        }),
      ]);

      throw new ServiceUnavailableException(
        "The restart request could not be queued",
        {
          cause: error,
        },
      );
    }

    await this.prismaService.client.deploymentLog.create({
      data: {
        deploymentId: id,
        level: "INFO",
        stage: "RESTART",
        message: `Restart requested from ${previousStatus} using image ${deployment.imageTag}`,
      },
    });

    // Return the deployment only after rechecking its ownership.
    return this.findOne(userId, id);
  }

  async remove(
    userId: string,
    id: string,
  ): Promise<{ queued: true; jobId: string }> {
    const deployment = await this.requireOwnedDeployment(userId, id);

    if (ACTIVE_DEPLOYMENT_STATUSES.includes(deployment.status)) {
      throw new ConflictException(
        `Deployment cannot be deleted while ${deployment.status}`,
      );
    }

    try {
      const jobId = await this.deploymentQueueService.addDeleteDeployment({
        deploymentId: deployment.id,
        artifacts: [
          {
            deploymentId: deployment.id,
            containerId: deployment.containerId,
            imageTag: deployment.imageTag,
          },
        ],
        requestedAt: new Date().toISOString(),
      });

      return { queued: true, jobId };
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        "The deployment deletion request could not be queued",
        { cause: error },
      );
    }
  }

  /**
   * Finds a deployment only when it belongs to the authenticated user.
   *
   * A 404 response is returned for both:
   * - A deployment that does not exist
   * - A deployment belonging to another user
   */
  private async requireOwnedDeployment(
    userId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    const deployment = await this.prismaService.client.deployment.findFirst({
      where: {
        id: deploymentId,
        project: {
          userId,
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException("Deployment not found");
    }

    return deployment;
  }
}
