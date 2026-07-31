import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service.js";
import { DeploymentsService } from "../deployments/deployments.service.js";

export interface GitHubPushPayload {
  ref?: string;
  deleted?: boolean;
  repository?: {
    id?: number;
    full_name?: string;
  };
}

export interface WebhookResult {
  accepted: boolean;
  ignored?: boolean;
  reason?: string;
  deploymentId?: string;
}

@Injectable()
export class GitHubWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly deploymentsService: DeploymentsService,
  ) {}

  verifySignature(rawBody: Buffer, signature: string | undefined): void {
    const secret = this.configService.get<string>("GITHUB_WEBHOOK_SECRET");

    if (!secret) {
      throw new InternalServerErrorException(
        "GITHUB_WEBHOOK_SECRET is not configured",
      );
    }

    if (!signature?.startsWith("sha256=")) {
      throw new UnauthorizedException("Missing GitHub webhook signature");
    }

    const expectedSignature = `sha256=${createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")}`;

    const receivedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Invalid GitHub webhook signature");
    }
  }

  async process(
    event: string | undefined,
    deliveryId: string | undefined,
    payload: GitHubPushPayload,
  ): Promise<WebhookResult> {
    if (!deliveryId) {
      throw new UnauthorizedException("Missing GitHub delivery ID");
    }

    if (event === "ping") {
      return {
        accepted: true,
        reason: "GitHub webhook ping received",
      };
    }

    if (event !== "push") {
      return {
        accepted: true,
        ignored: true,
        reason: `Ignored GitHub event: ${event ?? "unknown"}`,
      };
    }

    if (payload.deleted) {
      return {
        accepted: true,
        ignored: true,
        reason: "Deleted branch push ignored",
      };
    }

    const repositoryId = payload.repository?.id?.toString();

    if (!repositoryId) {
      return {
        accepted: true,
        ignored: true,
        reason: "Repository ID is missing",
      };
    }

    const project = await this.prismaService.client.project.findFirst({
      where: {
        repositoryId,
      },
    });

    if (!project) {
      return {
        accepted: true,
        ignored: true,
        reason: `No DevPilot project found for repository ${payload.repository?.full_name ?? repositoryId}`,
      };
    }

    const expectedRef = `refs/heads/${project.productionBranch}`;

    if (payload.ref !== expectedRef) {
      return {
        accepted: true,
        ignored: true,
        reason: `Push to ${payload.ref ?? "unknown branch"} ignored. Production branch is ${project.productionBranch}`,
      };
    }

    const existingDelivery =
      await this.prismaService.client.gitHubWebhookDelivery.findUnique({
        where: {
          deliveryId,
        },
      });

    if (existingDelivery) {
      return {
        accepted: true,
        ignored: true,
        reason: "Duplicate GitHub webhook delivery ignored",
        deploymentId: existingDelivery.deploymentId ?? undefined,
      };
    }

    await this.prismaService.client.gitHubWebhookDelivery.create({
      data: {
        deliveryId,
        event,
        repositoryId,
        projectId: project.id,
      },
    });

    try {
      const deployment = await this.deploymentsService.create(project.userId, {
        projectId: project.id,
      });

      await this.prismaService.client.gitHubWebhookDelivery.update({
        where: {
          deliveryId,
        },
        data: {
          deploymentId: deployment.id,
          processedAt: new Date(),
        },
      });

      return {
        accepted: true,
        deploymentId: deployment.id,
        reason: `Automatic deployment queued for ${project.repositoryOwner}/${project.repositoryName}`,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown automatic deployment error";

      await this.prismaService.client.gitHubWebhookDelivery.update({
        where: {
          deliveryId,
        },
        data: {
          errorMessage: message,
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
