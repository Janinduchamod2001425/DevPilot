import { Controller, Headers, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { GitHubWebhookService } from "./github-webhook.service.js";
import type {
  GitHubPushPayload,
  WebhookResult,
} from "./github-webhook.service.js";

type GitHubWebhookRequest = Request<
  Record<string, never>,
  unknown,
  GitHubPushPayload
>;

@Controller("webhooks/github")
export class GitHubWebhookController {
  constructor(private readonly githubWebhookService: GitHubWebhookService) {}

  @Post()
  async receive(
    @Req() request: RawBodyRequest<GitHubWebhookRequest>,
    @Headers("x-github-event") event: string | undefined,
    @Headers("x-github-delivery") deliveryId: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
  ): Promise<WebhookResult> {
    if (!request.rawBody) {
      throw new Error("Raw webhook body is unavailable");
    }

    this.githubWebhookService.verifySignature(request.rawBody, signature);

    const payload: GitHubPushPayload = request.body;

    return this.githubWebhookService.process(event, deliveryId, payload);
  }
}
