import { Module } from "@nestjs/common";
import { DeploymentQueueController } from "./deployment-queue.controller.js";
import { DeploymentQueueService } from "./deployment-queue.service.js";

@Module({
    controllers: [DeploymentQueueController],
    providers: [DeploymentQueueService],
    exports: [DeploymentQueueService],
})
export class DeploymentQueueModule {}