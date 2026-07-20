import {
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
}
