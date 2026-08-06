import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { GitHubService } from "../github/github.service.js";
import type { ImportProjectDto } from "./dto/import-project.dto.js";
import { DeploymentsService } from "../deployments/deployments.service.js";
import { DeploymentQueueService } from "../deployment-queue/deployment-queue.service.js";
import { DeploymentStatus } from "@devpilot/database";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly githubService: GitHubService,
    private readonly deploymentService: DeploymentsService,
    private readonly deploymentQueueService: DeploymentQueueService,
  ) {}

  async importProject(userId: string, dto: ImportProjectDto) {
    const authorized = await this.githubService.findAuthorizedRepository(
      userId,
      dto.installationId,
      dto.repositoryId,
    );

    const { repository, installation } = authorized;

    const rootDirectory = this.normalizeRootDirectory(dto.rootDirectory);

    const rootDetection = await this.githubService.detectRootDirectories(
      userId,
      dto.installationId,
      dto.repositoryId,
    );

    const selectedCandidate = rootDetection.candidates.find(
      (candidate) => candidate.rootDirectory === rootDirectory,
    );

    if (!selectedCandidate) {
      throw new BadRequestException(
        "The selected root directory was not found in this repository",
      );
    }

    if (!selectedCandidate.deployable) {
      throw new BadRequestException(
        `The selected root directory "${rootDirectory}" does not contain a supported project`,
      );
    }

    const existingProject = await this.prismaService.client.project.findFirst({
      where: {
        userId,
        repositoryOwner: repository.owner.login,
        repositoryName: repository.name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (existingProject) {
      throw new ConflictException({
        message: "This repository has already been imported",
        project: existingProject,
      });
    }

    const slug = await this.createUniqueSlug(
      repository.owner.login,
      repository.name,
      repository.id,
    );

    const project = await this.prismaService.client.project.create({
      data: {
        name: repository.name,
        slug,
        repositoryOwner: repository.owner.login,
        repositoryName: repository.name,
        repositoryUrl: repository.cloneUrl,
        repositoryId: repository.id,
        productionBranch: repository.defaultBranch,
        rootDirectory,
        userId,
        githubInstallationId: installation.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        repositoryOwner: true,
        repositoryName: true,
        repositoryUrl: true,
        repositoryId: true,
        productionBranch: true,
        rootDirectory: true,
        createdAt: true,
        updatedAt: true,

        githubInstallation: {
          select: {
            id: true,
            installationId: true,
            accountLogin: true,
            accountType: true,
          },
        },
      },
    });

    try {
      const deployment = await this.deploymentService.create(userId, {
        projectId: project.id,
      });

      return {
        project,
        deployment,
      };
    } catch (error) {
      console.error(
        `Initial deployment could not be created for project ${project.id}:`,
        error,
      );

      return {
        project,
        deployment: null,
        deploymentWarning:
          "The project was imported, but its first deployment could not be started.",
      };
    }
  }

  async findAll(userId: string) {
    return this.prismaService.client.project.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        repositoryOwner: true,
        repositoryName: true,
        repositoryUrl: true,
        repositoryId: true,
        productionBranch: true,
        rootDirectory: true,
        createdAt: true,
        updatedAt: true,

        deployments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            status: true,
            branch: true,
            commitSha: true,
            commitMessage: true,
            imageTag: true,
            containerId: true,
            assignedPort: true,
            liveUrl: true,
            errorCode: true,
            errorMessage: true,
            queuedAt: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },

        _count: {
          select: {
            deployments: true,
          },
        },
      },
    });
  }

  async findOne(userId: string, projectId: string) {
    const project = await this.prismaService.client.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        repositoryOwner: true,
        repositoryName: true,
        repositoryUrl: true,
        repositoryId: true,
        productionBranch: true,
        rootDirectory: true,
        createdAt: true,
        updatedAt: true,

        githubInstallation: {
          select: {
            id: true,
            installationId: true,
            accountLogin: true,
            accountType: true,
          },
        },

        deployments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            analysis: true,
          },
        },

        _count: {
          select: {
            deployments: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }

    return project;
  }

  async findDeployments(userId: string, projectId: string) {
    const project = await this.prismaService.client.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }

    return this.prismaService.client.deployment.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        analysis: true,
      },
    });
  }

  async findRootDirectories(userId: string, projectId: string) {
    const project = await this.prismaService.client.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        id: true,
        repositoryId: true,
        githubInstallationId: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }

    if (!project.githubInstallationId) {
      throw new BadRequestException(
        "This project is not connected to a GitHub installation",
      );
    }

    if (!project.repositoryId) {
      throw new BadRequestException(
        "This project is not connected to a GitHub repository",
      );
    }

    return this.githubService.detectRootDirectories(
      userId,
      project.githubInstallationId,
      project.repositoryId,
    );
  }

  async updateRootDirectory(
    userId: string,
    projectId: string,
    rootDirectory: unknown,
  ) {
    if (typeof rootDirectory !== "string") {
      throw new BadRequestException("rootDirectory must be a string");
    }

    const normalizedRootDirectory = this.normalizeRootDirectory(rootDirectory);

    const project = await this.prismaService.client.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        id: true,
        name: true,
        rootDirectory: true,
        repositoryId: true,
        githubInstallationId: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }

    if (!project.githubInstallationId) {
      throw new BadRequestException(
        "This project is not connected to a GitHub installation",
      );
    }

    if (!project.repositoryId) {
      throw new BadRequestException(
        "This project is not connected to a GitHub repository",
      );
    }

    const rootDetection = await this.githubService.detectRootDirectories(
      userId,
      project.githubInstallationId,
      project.repositoryId,
    );

    const selectedCandidate = rootDetection.candidates.find(
      (candidate) => candidate.rootDirectory === normalizedRootDirectory,
    );

    if (!selectedCandidate) {
      throw new BadRequestException(
        "The selected root directory was not found in this repository",
      );
    }

    if (!selectedCandidate.deployable) {
      throw new BadRequestException(
        `The selected root directory "${normalizedRootDirectory}" does not contain a supported project`,
      );
    }

    if (project.rootDirectory === normalizedRootDirectory) {
      return this.prismaService.client.project.findUniqueOrThrow({
        where: {
          id: project.id,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          repositoryOwner: true,
          repositoryName: true,
          productionBranch: true,
          rootDirectory: true,
          updatedAt: true,
        },
      });
    }

    return this.prismaService.client.project.update({
      where: {
        id: project.id,
      },
      data: {
        rootDirectory: normalizedRootDirectory,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        repositoryOwner: true,
        repositoryName: true,
        productionBranch: true,
        rootDirectory: true,
        updatedAt: true,
      },
    });
  }

  async remove(
    userId: string,
    projectId: string,
  ): Promise<{ queued: true; jobId: string }> {
    const project = await this.prismaService.client.project.findFirst({
      where: { id: projectId, userId },
      include: {
        deployments: {
          select: {
            id: true,
            status: true,
            containerId: true,
            imageTag: true,
          },
        },
      },
    });

    if (!project)
      throw new NotFoundException(`Project ${projectId} was not found`);

    const activeStatuses: DeploymentStatus[] = [
      DeploymentStatus.QUEUED,
      DeploymentStatus.CLONING,
      DeploymentStatus.ANALYZING,
      DeploymentStatus.BUILDING,
      DeploymentStatus.STARTING,
      DeploymentStatus.HEALTH_CHECKING,
    ];

    const active = project.deployments.find((item) =>
      activeStatuses.includes(item.status),
    );

    if (active) {
      throw new ConflictException(
        `Project cannot be deleted while deployment ${active.id} is ${active.status}`,
      );
    }

    try {
      const jobId = await this.deploymentQueueService.addDeleteProject({
        projectId,
        artifacts: project.deployments.map((item) => ({
          deploymentId: item.id,
          containerId: item.containerId,
          imageTag: item.imageTag,
        })),
        requestedAt: new Date().toISOString(),
      });

      return { queued: true, jobId };
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        "The project deletion request could not be queued",
        { cause: error },
      );
    }
  }

  private normalizeRootDirectory(rootDirectory: string): string {
    const normalized = rootDirectory
      .trim()
      .replaceAll("\\", "/")
      .replace(/\/+/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/\/$/, "");

    const resolvedDirectory = normalized || ".";

    if (
      resolvedDirectory.startsWith("/") ||
      /^[a-zA-Z]:\//.test(resolvedDirectory) ||
      resolvedDirectory
        .split("/")
        .some((segment) => segment === ".." || segment === "")
    ) {
      throw new BadRequestException(
        "rootDirectory must be a safe path inside the repository",
      );
    }

    return resolvedDirectory;
  }

  private async createUniqueSlug(
    repositoryOwner: string,
    repositoryName: string,
    repositoryId: string,
  ): Promise<string> {
    const baseSlug = this.slugify(`${repositoryOwner}-${repositoryName}`);

    const existingSlug = await this.prismaService.client.project.findUnique({
      where: {
        slug: baseSlug,
      },
      select: {
        id: true,
      },
    });

    if (!existingSlug) {
      return baseSlug;
    }

    return `${baseSlug}-${repositoryId}`;
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug) {
      throw new BadRequestException(
        "A valid project slug could not be generated",
      );
    }

    return slug;
  }
}
