import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DeploymentQueueModule } from "../deployment-queue/deployment-queue.module.js";
import { AutomaticDiagnosisProcessor } from "./automatic-diagnosis.processor.js";
import { DiagnosisService } from "./diagnosis.service.js";
import { DeploymentsController } from "./deployments.controller.js";
import { DeploymentsService } from "./deployments.service.js";

@Module({
  imports: [AuthModule, DeploymentQueueModule],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsService,
    DiagnosisService,
    AutomaticDiagnosisProcessor,
  ],
  exports: [DeploymentsService, DiagnosisService],
})
export class DeploymentsModule {}
