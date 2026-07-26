import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ImportProjectDto } from "./dto/import-project.dto.js";
import { UpdateRootDirectoryDto } from "./dto/update-root-directory.dto.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Post("import")
  async importProject(@Req() request: Request, @Body() body: ImportProjectDto) {
    const user = await this.requireUser(request);

    return this.projectsService.importProject(user.id, body);
  }

  @Get()
  async findAll(@Req() request: Request) {
    const user = await this.requireUser(request);

    return this.projectsService.findAll(user.id);
  }

  @Get(":projectId/deployments")
  async findDeployments(
    @Param("projectId") projectId: string,
    @Req() request: Request,
  ) {
    const user = await this.requireUser(request);

    return this.projectsService.findDeployments(user.id, projectId);
  }

  @Get(":projectId")
  async findOne(
    @Param("projectId") projectId: string,
    @Req() request: Request,
  ) {
    const user = await this.requireUser(request);

    return this.projectsService.findOne(user.id, projectId);
  }

  @Patch(":projectId/root-directory")
  async updateRootDirectory(
    @Param("projectId") projectId: string,
    @Body() body: UpdateRootDirectoryDto,
    @Req() request: Request,
  ) {
    const user = await this.requireUser(request);

    return this.projectsService.updateRootDirectory(
      user.id,
      projectId,
      body.rootDirectory,
    );
  }

  private async requireUser(request: Request): Promise<AuthenticatedUser> {
    const cookieName = this.authService.getCookieName();

    const sessionToken = request.cookies?.[cookieName] as string | undefined;

    const user = await this.authService.getAuthenticatedUser(sessionToken);

    if (!user) {
      throw new UnauthorizedException("Authentication is required");
    }

    return user;
  }
}
