import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeploymentLogLevel, DeploymentStatus } from "@devpilot/database";
import {
  DEPLOYMENT_JOB_NAME,
  DEPLOYMENT_QUEUE_NAME,
  RESTART_DEPLOYMENT_JOB_NAME,
  STOP_DEPLOYMENT_JOB_NAME,
  type DeploymentJobData,
  type DeploymentJobName,
  type DeploymentJobResult,
  type ProcessDeploymentJobData,
  type RestartDeploymentJobData,
  type StopDeploymentJobData,
} from "@devpilot/shared-types";
import { Job, Worker } from "bullmq";
import { RepositoryAnalyzerService } from "../analyzer/repository-analyzer.service.js";
import { MonorepoDiscoveryService } from "../analyzer/monorepo-discovery.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { DockerBuildService } from "../docker/docker-build.service.js";
import { DockerContainerService } from "../docker/docker-container.service.js";
import { DockerfileService } from "../docker/dockerfile.service.js";
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
    private readonly repositoryAnalyzerService: RepositoryAnalyzerService,
    private readonly monorepoDiscoveryService: MonorepoDiscoveryService,
    private readonly dockerfileService: DockerfileService,
    private readonly dockerBuildService: DockerBuildService,
    private readonly dockerContainerService: DockerContainerService,
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
        return this.processJob(job);
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
      this.logger.log(`Deployment job ${job.id ?? "unknown"} completed`);
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

  private async processJob(
    job: Job<DeploymentJobData, DeploymentJobResult, DeploymentJobName>,
  ): Promise<DeploymentJobResult> {
    if (job.name === DEPLOYMENT_JOB_NAME) {
      return this.processDeployment(
        job as Job<
          ProcessDeploymentJobData,
          DeploymentJobResult,
          typeof DEPLOYMENT_JOB_NAME
        >,
      );
    }

    if (job.name === STOP_DEPLOYMENT_JOB_NAME) {
      return this.processStopDeployment(
        job as Job<
          StopDeploymentJobData,
          DeploymentJobResult,
          typeof STOP_DEPLOYMENT_JOB_NAME
        >,
      );
    }

    if (job.name === RESTART_DEPLOYMENT_JOB_NAME) {
      return this.processRestartDeployment(
        job as Job<
          RestartDeploymentJobData,
          DeploymentJobResult,
          typeof RESTART_DEPLOYMENT_JOB_NAME
        >,
      );
    }

    throw new Error(`Unsupported deployment job: ${String(job.name)}`);
  }

  private async processDeployment(
    job: Job<
      ProcessDeploymentJobData,
      DeploymentJobResult,
      typeof DEPLOYMENT_JOB_NAME
    >,
  ): Promise<DeploymentJobResult> {
    const { deploymentId, repositoryUrl, branch, rootDirectory } = job.data;

    this.logger.log(
      `Received deployment job ${job.id ?? "unknown"} for deployment ${deploymentId}`,
    );

    try {
      const deployment = await this.prismaService.client.deployment.findUnique({
        where: {
          id: deploymentId,
        },
      });

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} was not found`);
      }

      await this.appendDeploymentLog(
        deploymentId,
        "WORKER",
        `Worker received deployment job ${job.id ?? "unknown"}`,
      );

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

      await this.appendDeploymentLog(
        deploymentId,
        "CLONING",
        `Cloning ${repositoryUrl} from branch ${branch}`,
      );

      this.logger.log(`Deployment ${deploymentId} changed to CLONING`);

      const cloneResult = await this.repositoryService.cloneRepository({
        deploymentId,
        repositoryUrl,
        branch,
      });

      await this.appendDeploymentLog(
        deploymentId,
        "CLONING",
        `Repository cloned successfully at commit ${cloneResult.commitSha}`,
      );

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

      await this.appendDeploymentLog(
        deploymentId,
        "ANALYZING",
        `Analyzing repository from root directory ${rootDirectory}`,
      );

      this.logger.log(`Deployment ${deploymentId} changed to ANALYZING`);

      const analysis = await this.repositoryAnalyzerService.analyze(
        cloneResult.workspacePath,
        rootDirectory,
      );

      const applicationPort = this.resolveApplicationPort(analysis);

      const discoveredApplications =
        await this.monorepoDiscoveryService.discover(cloneResult.workspacePath);

      await this.appendDeploymentLog(
        deploymentId,
        "ANALYZING",
        `Detected ${analysis.framework} project using ${analysis.packageManager}`,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "ANALYZING",
        `Application will run on internal port ${applicationPort}`,
      );

      await this.prismaService.client.deploymentAnalysis.upsert({
        where: {
          deploymentId,
        },
        create: {
          deploymentId,
          projectType: analysis.projectType,
          framework: analysis.framework,
          packageManager: analysis.packageManager,
          installCommand: analysis.installCommand,
          buildCommand: analysis.buildCommand,
          startCommand: analysis.startCommand,
          applicationPort,
          hasDockerfile: analysis.hasDockerfile,
          rootDirectory: analysis.rootDirectory,
          warnings: analysis.warnings,
          discoveredApplications,
        },
        update: {
          projectType: analysis.projectType,
          framework: analysis.framework,
          packageManager: analysis.packageManager,
          installCommand: analysis.installCommand,
          buildCommand: analysis.buildCommand,
          startCommand: analysis.startCommand,
          applicationPort,
          hasDockerfile: analysis.hasDockerfile,
          rootDirectory: analysis.rootDirectory,
          warnings: analysis.warnings,
          discoveredApplications,
        },
      });

      for (const application of discoveredApplications) {
        await this.appendDeploymentLog(
          deploymentId,
          "ANALYZING",
          `Application detected at ${application.rootDirectory}: ${application.framework}`,
        );
      }

      for (const warning of analysis.warnings) {
        await this.appendDeploymentLog(
          deploymentId,
          "ANALYZING",
          warning,
          DeploymentLogLevel.WARN,
        );

        this.logger.warn(warning);
      }

      await this.appendDeploymentLog(
        deploymentId,
        "DOCKERFILE",
        analysis.hasDockerfile
          ? "Preparing the repository Dockerfile"
          : "No Dockerfile detected; generating one from project analysis",
      );

      const dockerfileResult = await this.dockerfileService.prepare(
        cloneResult.workspacePath,
        analysis,
      );

      const dockerfileMessage = dockerfileResult.generated
        ? `Generated Dockerfile: ${dockerfileResult.dockerfilePath}`
        : `Using existing Dockerfile: ${dockerfileResult.dockerfilePath}`;

      await this.appendDeploymentLog(
        deploymentId,
        "DOCKERFILE",
        dockerfileMessage,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "BUILDING",
        `Building Docker image using context ${dockerfileResult.buildContextPath}`,
      );

      this.logger.log(dockerfileMessage);
      this.logger.log(
        `Docker build context: ${dockerfileResult.buildContextPath}`,
      );

      const dockerBuildResult = await this.dockerBuildService.build(
        deploymentId,
        dockerfileResult,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "BUILDING",
        `Docker image built successfully: ${dockerBuildResult.imageTag}`,
      );

      this.logger.log(`Deployment image ready: ${dockerBuildResult.imageTag}`);

      await this.appendDeploymentLog(
        deploymentId,
        "STARTING",
        `Starting application container on internal port ${applicationPort}`,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "HEALTH_CHECKING",
        "Waiting for the application to start and pass its health check",
      );

      const containerResult = await this.dockerContainerService.start(
        deploymentId,
        dockerBuildResult.imageTag,
        applicationPort,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "READY",
        `Deployment is ready at ${containerResult.liveUrl}`,
      );

      this.logger.log(`Deployment is live at ${containerResult.liveUrl}`);

      this.logger.log(`Detected framework: ${analysis.framework}`);
      this.logger.log(`Package manager: ${analysis.packageManager}`);

      this.logger.log(
        `Discovered ${discoveredApplications.length} deployable applications`,
      );

      for (const application of discoveredApplications) {
        this.logger.log(
          `${application.rootDirectory}: ${application.framework}`,
        );
      }

      this.logger.log(`Commit: ${cloneResult.commitSha}`);

      return {
        success: true,
        message: `Deployment is ready at ${containerResult.liveUrl}`,
        processedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";

      await this.markDeploymentAsFailed(deploymentId, message);

      throw error;
    }
  }

  private resolveApplicationPort(analysis: {
    framework: string;
    applicationPort: number | null;
  }): number {
    /*
     * Generated React + Vite deployments are served by Nginx, which
     * listens on port 80. This overrides Vite's development port and
     * the worker's previous fallback of 3000.
     */
    if (analysis.framework === "React with Vite") {
      return 80;
    }

    const detectedPort = Number(analysis.applicationPort);

    if (
      Number.isInteger(detectedPort) &&
      detectedPort >= 1 &&
      detectedPort <= 65_535
    ) {
      return detectedPort;
    }

    /*
     * Nuxt's generated Node server and the current generic fallback
     * both listen on port 3000.
     */
    return 3000;
  }

  private async processStopDeployment(
    job: Job<
      StopDeploymentJobData,
      DeploymentJobResult,
      typeof STOP_DEPLOYMENT_JOB_NAME
    >,
  ): Promise<DeploymentJobResult> {
    const { deploymentId, containerId } = job.data;

    this.logger.log(
      `Received stop job ${job.id ?? "unknown"} for deployment ${deploymentId}`,
    );

    try {
      const deployment = await this.prismaService.client.deployment.findUnique({
        where: {
          id: deploymentId,
        },
      });

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} was not found`);
      }

      await this.appendDeploymentLog(
        deploymentId,
        "STOPPING",
        "Stop request received; stopping application container",
      );

      if (deployment.status === DeploymentStatus.STOPPED) {
        await this.appendDeploymentLog(
          deploymentId,
          "STOPPED",
          "Deployment is already stopped",
          DeploymentLogLevel.WARN,
        );

        this.logger.log(`Deployment ${deploymentId} is already stopped`);

        return {
          success: true,
          message: `Deployment ${deploymentId} is already stopped`,
          processedAt: new Date().toISOString(),
        };
      }

      await this.dockerContainerService.stop(deploymentId, containerId);

      await this.appendDeploymentLog(
        deploymentId,
        "STOPPED",
        "Application container stopped successfully",
      );

      this.logger.log(`Deployment ${deploymentId} stopped successfully`);

      return {
        success: true,
        message: `Deployment ${deploymentId} stopped successfully`,
        processedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown stop-deployment error";

      await this.appendDeploymentLog(
        deploymentId,
        "STOPPING",
        `Failed to stop deployment: ${message}`,
        DeploymentLogLevel.ERROR,
      );

      this.logger.error(
        `Failed to stop deployment ${deploymentId}: ${message}`,
      );

      throw error;
    }
  }

  private async processRestartDeployment(
    job: Job<
      RestartDeploymentJobData,
      DeploymentJobResult,
      typeof RESTART_DEPLOYMENT_JOB_NAME
    >,
  ): Promise<DeploymentJobResult> {
    const { deploymentId, imageTag, applicationPort } = job.data;

    this.logger.log(
      `Received restart job ${job.id ?? "unknown"} for deployment ${deploymentId}`,
    );

    try {
      const deployment = await this.prismaService.client.deployment.findUnique({
        where: {
          id: deploymentId,
        },
      });

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} was not found`);
      }

      await this.appendDeploymentLog(
        deploymentId,
        "RESTARTING",
        `Restart request received for Docker image ${imageTag}`,
      );

      if (deployment.status !== DeploymentStatus.STARTING) {
        throw new Error(
          `Deployment ${deploymentId} cannot be restarted from status ${deployment.status}`,
        );
      }

      if (!deployment.imageTag) {
        throw new Error(
          `Deployment ${deploymentId} does not have a Docker image`,
        );
      }

      if (deployment.imageTag !== imageTag) {
        throw new Error(
          `Restart image does not match the stored image for deployment ${deploymentId}`,
        );
      }

      await this.appendDeploymentLog(
        deploymentId,
        "STARTING",
        `Starting a new container on internal port ${applicationPort}`,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "HEALTH_CHECKING",
        "Waiting for the restarted application to become healthy",
      );

      const containerResult = await this.dockerContainerService.start(
        deploymentId,
        imageTag,
        applicationPort,
      );

      await this.appendDeploymentLog(
        deploymentId,
        "READY",
        `Deployment restarted successfully at ${containerResult.liveUrl}`,
      );

      this.logger.log(
        `Deployment ${deploymentId} restarted at ${containerResult.liveUrl}`,
      );

      return {
        success: true,
        message: `Deployment restarted at ${containerResult.liveUrl}`,
        processedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown restart-deployment error";

      await this.markDeploymentAsFailed(
        deploymentId,
        message,
        "RESTART_FAILED",
      );

      throw error;
    }
  }

  private async appendDeploymentLog(
    deploymentId: string,
    stage: string,
    message: string,
    level: DeploymentLogLevel = DeploymentLogLevel.INFO,
  ): Promise<void> {
    try {
      await this.prismaService.client.deploymentLog.create({
        data: {
          deploymentId,
          level,
          stage,
          message,
        },
      });
    } catch (error: unknown) {
      const logError =
        error instanceof Error
          ? error.message
          : "Unknown deployment-log persistence error";

      /*
       * A logging failure should not cause an otherwise valid deployment
       * to fail.
       */
      this.logger.error(
        `Could not persist log for deployment ${deploymentId}: ${logError}`,
      );
    }
  }

  private async markDeploymentAsFailed(
    deploymentId: string,
    message: string,
    errorCode = "WORKER_PROCESSING_FAILED",
  ): Promise<void> {
    await this.prismaService.client.deployment.updateMany({
      where: {
        id: deploymentId,
      },
      data: {
        status: DeploymentStatus.FAILED,
        containerId: null,
        assignedPort: null,
        liveUrl: null,
        errorCode,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });

    await this.appendDeploymentLog(
      deploymentId,
      "FAILED",
      message,
      DeploymentLogLevel.ERROR,
    );

    this.logger.error(
      `Deployment ${deploymentId} changed to FAILED: ${message}`,
    );
  }
}
