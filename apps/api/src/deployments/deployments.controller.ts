import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  Delete,
} from "@nestjs/common";
import type {
  AiDiagnosis,
  Deployment,
  DeploymentAnalysis,
  DeploymentLog,
} from "@devpilot/database";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { DiagnosisService } from "./diagnosis.service.js";
import { CreateDeploymentDto } from "./dto/create-deployment.dto.js";
import { DeploymentsService } from "./deployments.service.js";

@UseGuards(AuthGuard)
@Controller("deployments")
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly diagnosisService: DiagnosisService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDeploymentDto,
  ): Promise<Deployment> {
    return this.deploymentsService.create(request.user.id, dto);
  }

  @Get(":id/analysis")
  findAnalysis(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<DeploymentAnalysis> {
    return this.deploymentsService.findAnalysis(request.user.id, id);
  }

  @Get(":id/logs")
  findLogs(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<DeploymentLog[]> {
    return this.deploymentsService.findLogs(request.user.id, id);
  }

  @Get(":id/diagnosis")
  findDiagnosis(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiDiagnosis> {
    return this.diagnosisService.findOne(request.user.id, id);
  }

  @Post(":id/diagnosis")
  generateDiagnosis(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiDiagnosis> {
    return this.diagnosisService.generate(request.user.id, id);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Deployment> {
    return this.deploymentsService.findOne(request.user.id, id);
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.ACCEPTED)
  stop(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Deployment> {
    return this.deploymentsService.stop(request.user.id, id);
  }

  @Post(":id/restart")
  @HttpCode(HttpStatus.ACCEPTED)
  restart(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Deployment> {
    return this.deploymentsService.restart(request.user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.ACCEPTED)
  remove(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ queued: true; jobId: string }> {
    return this.deploymentsService.remove(request.user.id, id);
  }
}
