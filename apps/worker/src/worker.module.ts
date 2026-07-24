import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module.js";
import { DeploymentWorkerModule } from "./deployment/deployment-worker.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    DeploymentWorkerModule,
  ],
})
export class WorkerModule {}
