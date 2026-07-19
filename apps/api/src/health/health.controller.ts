import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";

type DependencyStatus = "up" | "down";

type HealthResponse = {
  status: "ok";
  service: "api";
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  timestamp: string;
};

@Controller("health")
export class HealthController {
  constructor(
      private readonly prismaService: PrismaService,
      private readonly redisService: RedisService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const [databaseConnected, redisConnected] =
        await Promise.all([
          this.prismaService.checkConnection(),
          this.redisService.checkConnection(),
        ]);

    const checks = {
      database: databaseConnected ? "up" : "down",
      redis: redisConnected ? "up" : "down",
    } satisfies HealthResponse["checks"];

    const timestamp = new Date().toISOString();

    if (!databaseConnected || !redisConnected) {
      throw new ServiceUnavailableException({
        status: "error",
        service: "api",
        checks,
        timestamp,
      });
    }

    return {
      status: "ok",
      service: "api",
      checks,
      timestamp,
    };
  }
}