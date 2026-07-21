import { Module } from "@nestjs/common";
import { MonorepoDiscoveryService } from "./monorepo-discovery.service.js";
import { RepositoryAnalyzerService } from "./repository-analyzer.service.js";

@Module({
  providers: [RepositoryAnalyzerService, MonorepoDiscoveryService],
  exports: [RepositoryAnalyzerService, MonorepoDiscoveryService],
})
export class AnalyzerModule {}
