import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AUTOMATIC_DIAGNOSIS_JOB_NAME,
  DIAGNOSIS_QUEUE_NAME,
  type AutomaticDiagnosisJobData,
} from "@devpilot/shared-types";
import { Job, Worker } from "bullmq";
import { DiagnosisService } from "./diagnosis.service.js";

@Injectable()
export class AutomaticDiagnosisProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AutomaticDiagnosisProcessor.name);

  private worker?: Worker<AutomaticDiagnosisJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly diagnosisService: DiagnosisService,
  ) {}

  onModuleInit(): void {
    const host = this.configService.get<string>("REDIS_HOST") ?? "localhost";

    const port = Number(this.configService.get<string>("REDIS_PORT") ?? 6380);

    this.worker = new Worker<AutomaticDiagnosisJobData>(
      DIAGNOSIS_QUEUE_NAME,
      async (job: Job<AutomaticDiagnosisJobData>) => {
        if (job.name !== AUTOMATIC_DIAGNOSIS_JOB_NAME) {
          throw new Error(`Unsupported diagnosis job: ${job.name}`);
        }

        const { deploymentId } = job.data;

        this.logger.log(
          `Generating automatic diagnosis for deployment ${deploymentId}`,
        );

        const diagnosis =
          await this.diagnosisService.generateAutomatic(deploymentId);

        this.logger.log(
          `Automatic diagnosis completed for deployment ${deploymentId}`,
        );

        return {
          diagnosisId: diagnosis.id,
          deploymentId,
          status: diagnosis.status,
        };
      },
      {
        connection: {
          host,
          port,
        },
        concurrency: 2,
      },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Automatic diagnosis job ${job?.id ?? "unknown"} failed: ${error.message}`,
      );
    });

    this.worker.on("error", (error) => {
      this.logger.error(`Automatic diagnosis worker error: ${error.message}`);
    });

    this.logger.log(`Listening to queue: ${DIAGNOSIS_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
