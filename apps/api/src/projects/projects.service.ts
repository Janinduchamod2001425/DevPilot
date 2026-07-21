import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

type DiscoveredApplication = {
  rootDirectory: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prismaService: PrismaService) {}

  async updateRootDirectory(projectId: string, rootDirectory: unknown) {
    if (typeof rootDirectory !== "string" || !rootDirectory.trim()) {
      throw new BadRequestException("rootDirectory must be a non-empty string");
    }

    const normalizedRootDirectory = rootDirectory.trim().replaceAll("\\", "/");

    const project = await this.prismaService.client.project.findUnique({
      where: {
        id: projectId,
      },

      include: {
        deployments: {
          where: {
            analysis: {
              isNot: null,
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          take: 1,

          include: {
            analysis: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }

    const latestAnalysis = project.deployments[0]?.analysis;

    if (!latestAnalysis) {
      throw new BadRequestException(
        "No repository analysis is available for this project",
      );
    }

    const discoveredApplications = this.parseDiscoveredApplications(
      latestAnalysis.discoveredApplications,
    );

    const selectedApplication = discoveredApplications.find(
      (application) => application.rootDirectory === normalizedRootDirectory,
    );

    if (!selectedApplication) {
      throw new BadRequestException(
        `Root directory "${normalizedRootDirectory}" was not found in the discovered applications`,
      );
    }

    return this.prismaService.client.project.update({
      where: {
        id: projectId,
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

  private parseDiscoveredApplications(value: unknown): DiscoveredApplication[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        "The latest analysis does not contain discovered applications",
      );
    }

    return value.filter(
      (application): application is DiscoveredApplication =>
        this.isRecord(application) &&
        typeof application.rootDirectory === "string",
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
