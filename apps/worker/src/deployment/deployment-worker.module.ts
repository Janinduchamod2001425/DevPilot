import { Module } from "@nestjs/common";
import { DeploymentProcessorService } from "./deployment-processor.service.js";
import { RepositoryModule } from "../repository/repository.module.js";

@Module({
  imports: [RepositoryModule],
  providers: [DeploymentProcessorService],
})
export class DeploymentWorkerModule {}
