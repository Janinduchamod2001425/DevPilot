import { Module } from "@nestjs/common";
import { AnalyzerModule } from "../analyzer/analyzer.module.js";
import { DockerModule } from "../docker/docker.module.js";
import { RepositoryModule } from "../repository/repository.module.js";
import { DeploymentProcessorService } from "./deployment-processor.service.js";

@Module({
  imports: [RepositoryModule, AnalyzerModule, DockerModule],
  providers: [DeploymentProcessorService],
})
export class DeploymentWorkerModule {}
