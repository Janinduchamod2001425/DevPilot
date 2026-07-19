import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

type HealthResponse = {
  status: "ok";
  service: "api";
  checks: {
    database: "up";
  };
  timestamp: string;
};

@Controller("health")
export class HealthController {
  constructor(
      private readonly prismaService: PrismaService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const databaseConnected =
        await this.prismaService.checkConnection();

    if (!databaseConnected) {
      throw new ServiceUnavailableException({
        status: "error",
        service: "api",
        checks: {
          database: "down",
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ok",
      service: "api",
      checks: {
        database: "up",
      },
      timestamp: new Date().toISOString(),
    };
  }
}