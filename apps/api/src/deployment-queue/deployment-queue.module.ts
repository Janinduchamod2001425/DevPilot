import { Module } from "@nestjs/common";
import { DeploymentQueueService } from "./deployment-queue.service.js";

@Module({
    providers: [DeploymentQueueService],
    exports: [DeploymentQueueService],
})
export class DeploymentQueueModule {}