import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    DEPLOYMENT_QUEUE_NAME,
    type DeploymentJobData,
    type DeploymentJobName,
    type DeploymentJobResult,
} from "@devpilot/shared-types";
import {
    Job,
    Worker,
} from "bullmq";

@Injectable()
export class DeploymentProcessorService
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(
        DeploymentProcessorService.name,
    );

    private worker?: Worker<
        DeploymentJobData,
        DeploymentJobResult,
        DeploymentJobName
    >;

    constructor(
        private readonly configService: ConfigService,
    ) {}

    onModuleInit(): void {
        const host =
            this.configService.get<string>("REDIS_HOST") ??
            "localhost";

        const port = Number(
            this.configService.get<string>("REDIS_PORT") ??
            6380,
        );

        this.worker = new Worker<
            DeploymentJobData,
            DeploymentJobResult,
            DeploymentJobName
        >(
            DEPLOYMENT_QUEUE_NAME,

            async (
                job: Job<
                    DeploymentJobData,
                    DeploymentJobResult,
                    DeploymentJobName
                >,
            ): Promise<DeploymentJobResult> => {
                this.logger.log(
                    `Received deployment job ${job.id}`,
                );

                this.logger.log(
                    `Repository: ${job.data.repositoryUrl}`,
                );

                this.logger.log(
                    `Branch: ${job.data.branch}`,
                );

                return {
                    success: true,
                    message: `Deployment job ${job.id} processed`,
                    processedAt: new Date().toISOString(),
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

        this.worker.on("completed", (job) => {
            this.logger.log(
                `Deployment job ${job.id} completed`,
            );
        });

        this.worker.on("failed", (job, error) => {
            this.logger.error(
                `Deployment job ${job?.id ?? "unknown"} failed: ${error.message}`,
            );
        });

        this.worker.on("error", (error) => {
            this.logger.error(
                `Worker error: ${error.message}`,
            );
        });

        this.logger.log(
            `Listening to queue: ${DEPLOYMENT_QUEUE_NAME}`,
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }
}