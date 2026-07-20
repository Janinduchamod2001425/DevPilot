import { Module } from "@nestjs/common";
import { DeploymentQueueModule } from "../deployment-queue/deployment-queue.module.js";
import { DeploymentsController } from "./deployments.controller.js";
import { DeploymentsService } from "./deployments.service.js";

@Module({
    imports: [DeploymentQueueModule],
    controllers: [DeploymentsController],
    providers: [DeploymentsService],
})
export class DeploymentsModule {}