import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { ConfigModule } from "@nestjs/config";
import { RedisModule } from "./redis/redis.module.js";
import { DeploymentsModule } from "./deployments/deployments.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { AuthModule } from "./auth/auth.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    DeploymentsModule,
    HealthModule,
    ProjectsModule,
  ],
})
export class AppModule {}
