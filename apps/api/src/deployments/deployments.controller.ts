import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type {
  Deployment,
  DeploymentAnalysis,
  DeploymentLog,
} from "@devpilot/database";
import { CreateDeploymentDto } from "./dto/create-deployment.dto.js";
import { DeploymentsService } from "./deployments.service.js";

@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateDeploymentDto): Promise<Deployment> {
    return this.deploymentsService.create(dto);
  }

  @Get(":id/analysis")
  async findAnalysis(@Param("id") id: string): Promise<DeploymentAnalysis> {
    return this.deploymentsService.findAnalysis(id);
  }

  @Get(":id/logs")
  async findLogs(@Param("id") id: string): Promise<DeploymentLog[]> {
    return this.deploymentsService.findLogs(id);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<Deployment> {
    return this.deploymentsService.findOne(id);
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.ACCEPTED)
  async stop(@Param("id") id: string): Promise<Deployment> {
    return this.deploymentsService.stop(id);
  }

  @Post(":id/restart")
  @HttpCode(HttpStatus.ACCEPTED)
  async restart(@Param("id") id: string): Promise<Deployment> {
    return this.deploymentsService.restart(id);
  }
}
