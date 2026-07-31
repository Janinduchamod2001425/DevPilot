import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { DeploymentsModule } from "../deployments/deployments.module.js";
import { GitHubWebhookController } from "./github-webhook.controller.js";
import { GitHubWebhookService } from "./github-webhook.service.js";

@Module({
  imports: [DatabaseModule, DeploymentsModule],
  controllers: [GitHubWebhookController],
  providers: [GitHubWebhookService],
})
export class WebhooksModule {}
