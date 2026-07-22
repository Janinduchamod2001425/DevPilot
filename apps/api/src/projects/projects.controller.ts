import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UpdateRootDirectoryDto } from "./dto/update-root-directory.dto.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(":projectId/deployments")
  findDeployments(@Param("projectId") projectId: string) {
    return this.projectsService.findDeployments(projectId);
  }

  @Get(":projectId")
  findOne(@Param("projectId") projectId: string) {
    return this.projectsService.findOne(projectId);
  }

  @Patch(":projectId/root-directory")
  updateRootDirectory(
    @Param("projectId") projectId: string,
    @Body() body: UpdateRootDirectoryDto,
  ) {
    return this.projectsService.updateRootDirectory(
      projectId,
      body.rootDirectory,
    );
  }
}
