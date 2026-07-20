import {
    Body,
    Controller, Get,
    HttpCode,
    HttpStatus, Param,
    Post,
} from "@nestjs/common";
import type { Deployment } from "@devpilot/database";
import { CreateDeploymentDto } from "./dto/create-deployment.dto.js";
import { DeploymentsService } from "./deployments.service.js";

@Controller("deployments")
export class DeploymentsController {
    constructor(
        private readonly deploymentsService:
        DeploymentsService,
    ) {}

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    async create(
        @Body() dto: CreateDeploymentDto,
    ): Promise<Deployment> {
        return this.deploymentsService.create(dto);
    }

    @Get(":id")
    async findOne(
        @Param("id") id: string,
    ): Promise<Deployment> {
        return this.deploymentsService.findOne(id);
    }
}