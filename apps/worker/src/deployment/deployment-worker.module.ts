import { Module } from "@nestjs/common";
import { DeploymentProcessorService } from "./deployment-processor.service.js";
import { RepositoryModule } from "../repository/repository.module.js";
import { AnalyzerModule } from "../analyzer/analyzer.module.js";

@Module({
  imports: [RepositoryModule, AnalyzerModule],
  providers: [DeploymentProcessorService],
})
export class DeploymentWorkerModule {}
