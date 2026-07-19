import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DeploymentWorkerModule } from "./deployment/deployment-worker.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),

    DeploymentWorkerModule,
  ],
})
export class WorkerModule {}