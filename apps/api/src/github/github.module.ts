import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { GitHubController } from "./github.controller.js";
import { GitHubService } from "./github.service.js";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [GitHubController],
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
