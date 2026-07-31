import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { ImportProjectDto } from "./dto/import-project.dto.js";
import { UpdateRootDirectoryDto } from "./dto/update-root-directory.dto.js";
import { ProjectsService } from "./projects.service.js";

@UseGuards(AuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post("import")
  importProject(
    @Req() request: AuthenticatedRequest,
    @Body() body: ImportProjectDto,
  ) {
    return this.projectsService.importProject(request.user.id, body);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.projectsService.findAll(request.user.id);
  }

  @Get(":projectId/deployments")
  findDeployments(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.findDeployments(request.user.id, projectId);
  }

  @Get(":projectId/root-directories")
  findRootDirectories(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.findRootDirectories(request.user.id, projectId);
  }

  @Get(":projectId")
  findOne(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.findOne(request.user.id, projectId);
  }

  @Patch(":projectId/root-directory")
  updateRootDirectory(
    @Param("projectId") projectId: string,
    @Body() body: UpdateRootDirectoryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.updateRootDirectory(
      request.user.id,
      projectId,
      body.rootDirectory,
    );
  }
}
