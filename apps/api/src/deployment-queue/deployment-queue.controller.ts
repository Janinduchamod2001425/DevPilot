import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CreateTestDeploymentJobDto } from "./dto/create-test-deployment-job.dto.js";
import { DeploymentQueueService } from "./deployment-queue.service.js";

@Controller("deployment-jobs")
export class DeploymentQueueController {
    constructor(
        private readonly deploymentQueueService:
        DeploymentQueueService,
    ) {}

    @Post("test")
    @HttpCode(HttpStatus.ACCEPTED)
    async createTestJob(
        @Body() dto: CreateTestDeploymentJobDto,
    ): Promise<{
        message: string;
        jobId: string;
        deploymentId: string;
    }> {
        const deploymentId = randomUUID();

        const jobId =
            await this.deploymentQueueService.addDeployment({
                deploymentId,
                projectId: "queue-foundation-test",
                repositoryUrl: dto.repositoryUrl,
                branch: dto.branch,
                requestedAt: new Date().toISOString(),
            });

        return {
            message: "Deployment job accepted",
            jobId,
            deploymentId,
        };
    }
}