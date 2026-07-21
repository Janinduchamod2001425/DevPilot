import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { Queue } from "bullmq";

@Injectable()
export class DeploymentQueueService implements OnModuleDestroy {
  private readonly queue: Queue<
    DeploymentJobData,
    DeploymentJobResult,
    DeploymentJobName
  >;

  constructor(configService: ConfigService) {
    const host = configService.get<string>("REDIS_HOST") ?? "localhost";

    const port = Number(configService.get<string>("REDIS_PORT") ?? 6380);

    this.queue = new Queue<
      DeploymentJobData,
      DeploymentJobResult,
      DeploymentJobName
    >(DEPLOYMENT_QUEUE_NAME, {
      connection: {
        host,
        port,
        connectTimeout: 2_000,
        maxRetriesPerRequest: 1,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }

  async addDeployment(data: ProcessDeploymentJobData): Promise<string> {
    const job = await this.queue.add(DEPLOYMENT_JOB_NAME, data);

    if (!job.id) {
      throw new Error("BullMQ did not return a job identifier");
    }

    return job.id;
  }

  async addStopDeployment(data: StopDeploymentJobData): Promise<string> {
    const job = await this.queue.add(STOP_DEPLOYMENT_JOB_NAME, data);

    if (!job.id) {
      throw new Error("BullMQ did not return a job identifier");
    }

    return job.id;
  }

  async addRestartDeployment(data: RestartDeploymentJobData): Promise<string> {
    const job = await this.queue.add(RESTART_DEPLOYMENT_JOB_NAME, data);

    if (!job.id) {
      throw new Error("BullMQ did not return a job identifier");
    }

    return job.id;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
