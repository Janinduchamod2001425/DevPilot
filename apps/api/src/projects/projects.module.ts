import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { GitHubModule } from "../github/github.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { DeploymentsModule } from "../deployments/deployments.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, GitHubModule, DeploymentsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
