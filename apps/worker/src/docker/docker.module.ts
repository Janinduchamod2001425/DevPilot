import { Module } from "@nestjs/common";
import { DockerfileService } from "./dockerfile.service.js";
import { DockerContainerService } from "./docker-container.service.js";
import { DockerBuildService } from "./docker-build.service.js";

@Module({
  providers: [DockerfileService, DockerBuildService, DockerContainerService],
  exports: [DockerfileService, DockerBuildService, DockerContainerService],
})
export class DockerModule {}
