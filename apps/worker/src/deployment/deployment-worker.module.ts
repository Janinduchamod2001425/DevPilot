import { Module } from "@nestjs/common";
import { DeploymentProcessorService } from "./deployment-processor.service.js";

@Module({
    providers: [DeploymentProcessorService],
})
export class DeploymentWorkerModule {}