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

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deploymentQueueService: DeploymentQueueService,
  ) {}

  async create(dto: CreateDeploymentDto): Promise<Deployment> {
    const project = await this.prismaService.client.project.findUnique({
      where: {
        id: dto.projectId,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} was not found`);
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

  async findOne(id: string): Promise<Deployment> {
    const deployment = await this.prismaService.client.deployment.findUnique({
      where: {
        id,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${id} was not found`);
    }

    return deployment;
  }

  async findAnalysis(deploymentId: string): Promise<DeploymentAnalysis> {
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

  async findLogs(deploymentId: string): Promise<DeploymentLog[]> {
    const deployment = await this.prismaService.client.deployment.findUnique({
      where: {
        id: deploymentId,
      },
      select: {
        id: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} was not found`);
    }

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

  async stop(id: string): Promise<Deployment> {
    const deployment = await this.prismaService.client.deployment.findUnique({
      where: {
        id,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${id} was not found`);
    }

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

  async restart(id: string): Promise<Deployment> {
    const deployment = await this.prismaService.client.deployment.findUnique({
      where: {
        id,
      },
      include: {
        analysis: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${id} was not found`);
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
       * Restore the deployment's previous status when Redis cannot
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

    return this.findOne(id);
  }
}
