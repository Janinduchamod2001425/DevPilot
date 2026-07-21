import { Body, Controller, Param, Patch } from "@nestjs/common";
import { UpdateRootDirectoryDto } from "./dto/update-root-directory.dto.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
