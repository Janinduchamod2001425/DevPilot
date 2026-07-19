import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./database/database.module.js";
import {ConfigModule} from "@nestjs/config";
import {RedisModule} from "./redis/redis.module.js";
import {DeploymentQueueModule} from "./deployment-queue/deployment-queue.module.js";

@Module({
  imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ["../../.env", ".env"]
      }),
      DatabaseModule,
      RedisModule,
      DeploymentQueueModule,
      HealthModule],
})
export class AppModule {}
