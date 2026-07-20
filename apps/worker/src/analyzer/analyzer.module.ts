import { Module } from "@nestjs/common";
import { RepositoryAnalyzerService } from "./repository-analyzer.service.js";

@Module({
  providers: [RepositoryAnalyzerService],
  exports: [RepositoryAnalyzerService],
})
export class AnalyzerModule {}
