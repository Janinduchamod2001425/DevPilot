import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeploymentStatus } from "@devpilot/database";
import {
  DEPLOYMENT_QUEUE_NAME,
  type DeploymentJobData,
  type DeploymentJobName,
  type DeploymentJobResult,
} from "@devpilot/shared-types";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../database/prisma.service.js";
import { RepositoryService } from "../repository/repository.service.js";

@Injectable()
export class DeploymentProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DeploymentProcessorService.name);

  private worker?: Worker<
    DeploymentJobData,
    DeploymentJobResult,
    DeploymentJobName
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly repositoryService: RepositoryService,
  ) {}

  onModuleInit(): void {
    const host = this.configService.get<string>("REDIS_HOST") ?? "localhost";

    const port = Number(this.configService.get<string>("REDIS_PORT") ?? 6380);

    this.worker = new Worker<
      DeploymentJobData,
      DeploymentJobResult,
      DeploymentJobName
    >(
      DEPLOYMENT_QUEUE_NAME,

      async (
        job: Job<DeploymentJobData, DeploymentJobResult, DeploymentJobName>,
      ): Promise<DeploymentJobResult> => {
        return this.processDeployment(job);
      },

      {
        connection: {
          host,
          port,
        },

        concurrency: 2,
      },
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`Deployment job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Deployment job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("error", (error) => {
      this.logger.error(`Worker error: ${error.message}`);
    });

    this.logger.log(`Listening to queue: ${DEPLOYMENT_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async processDeployment(
    job: Job<DeploymentJobData, DeploymentJobResult, DeploymentJobName>,
  ): Promise<DeploymentJobResult> {
    const { deploymentId, repositoryUrl, branch } = job.data;

    this.logger.log(`Received deployment job ${job.id}`);

    try {
      const deployment = await this.prismaService.client.deployment.findUnique({
        where: {
          id: deploymentId,
        },
      });

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} was not found`);
      }

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },

        data: {
          status: DeploymentStatus.CLONING,
          startedAt: deployment.startedAt ?? new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });

      this.logger.log(`Deployment ${deploymentId} changed to CLONING`);

      const cloneResult = await this.repositoryService.cloneRepository({
        deploymentId,
        repositoryUrl,
        branch,
      });

      this.logger.log(`Repository cloned into ${cloneResult.workspacePath}`);

      await this.prismaService.client.deployment.update({
        where: {
          id: deploymentId,
        },

        data: {
          status: DeploymentStatus.ANALYZING,
          commitSha: cloneResult.commitSha,
          commitMessage: cloneResult.commitMessage,
        },
      });

      this.logger.log(`Deployment ${deploymentId} changed to ANALYZING`);

      this.logger.log(`Commit: ${cloneResult.commitSha}`);

      return {
        success: true,
        message: `Repository cloned and ready for analysis`,
        processedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";

      await this.markDeploymentAsFailed(deploymentId, message);

      throw error;
    }
  }

  private async markDeploymentAsFailed(
    deploymentId: string,
    message: string,
  ): Promise<void> {
    await this.prismaService.client.deployment.updateMany({
      where: {
        id: deploymentId,
      },

      data: {
        status: DeploymentStatus.FAILED,
        errorCode: "WORKER_PROCESSING_FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}
