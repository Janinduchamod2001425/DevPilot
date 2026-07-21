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

    const deployment = await this.prismaService.client.deployment.create({
      data: {
        projectId: project.id,
        branch: project.productionBranch,
        status: DeploymentStatus.QUEUED,
      },
    });

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

      await this.prismaService.client.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: DeploymentStatus.FAILED,
          errorCode: "QUEUE_PUBLISH_FAILED",
          errorMessage: message,
          finishedAt: new Date(),
        },
      });

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

    if (deployment.status !== DeploymentStatus.STOPPED) {
      throw new ConflictException(
        `Only STOPPED deployments can be restarted. Current status: ${deployment.status}`,
      );
    }

    if (!deployment.imageTag) {
      throw new ConflictException(
        `Deployment ${id} does not have a Docker image`,
      );
    }

    if (!deployment.analysis) {
      throw new ConflictException(
        `Deployment ${id} does not have deployment analysis`,
      );
    }

    const applicationPort = deployment.analysis.applicationPort ?? 3000;

    /*
     * This conditional update prevents two simultaneous restart
     * requests from both being accepted.
     */
    const transition = await this.prismaService.client.deployment.updateMany({
      where: {
        id,
        status: DeploymentStatus.STOPPED,
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
      /*
       * Redis could be unavailable after we changed the status.
       * Restore STOPPED so the user can safely retry.
       */
      await this.prismaService.client.deployment.updateMany({
        where: {
          id,
          status: DeploymentStatus.STARTING,
          containerId: null,
        },
        data: {
          status: DeploymentStatus.STOPPED,
          errorCode: "RESTART_QUEUE_PUBLISH_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown queue error",
          finishedAt: new Date(),
        },
      });

      throw new ServiceUnavailableException(
        "The restart request could not be queued",
        {
          cause: error,
        },
      );
    }

    return this.findOne(id);
  }
}
