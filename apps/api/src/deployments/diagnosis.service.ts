import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI, Type } from "@google/genai";
import {
  AiDiagnosisStatus,
  DeploymentLogLevel,
  DeploymentStatus,
  type AiDiagnosis,
} from "@devpilot/database";
import { PrismaService } from "../database/prisma.service.js";

interface GeneratedDiagnosis {
  failureSummary: string;
  likelyRootCause: string;
  relevantLogLines: string[];
  recommendedFixes: string[];
  confidence: number;
}

const MAX_LOGS = 150;
const MAX_LOG_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LOG_LENGTH = 40_000;

@Injectable()
export class DiagnosisService {
  private readonly geminiClient: GoogleGenAI;
  private readonly diagnosisModel: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.getOrThrow<string>("GEMINI_API_KEY");

    this.diagnosisModel =
      this.configService.get<string>("GEMINI_DIAGNOSIS_MODEL") ??
      "gemini-2.5-flash";

    this.geminiClient = new GoogleGenAI({
      apiKey,
    });
  }

  async findOne(userId: string, deploymentId: string): Promise<AiDiagnosis> {
    await this.verifyDeploymentOwnership(userId, deploymentId);

    const diagnosis = await this.prismaService.client.aiDiagnosis.findUnique({
      where: {
        deploymentId,
      },
    });

    if (!diagnosis) {
      throw new NotFoundException(
        "No AI diagnosis exists for this deployment.",
      );
    }

    return diagnosis;
  }

  async generate(userId: string, deploymentId: string): Promise<AiDiagnosis> {
    const deployment = await this.verifyDeploymentOwnership(
      userId,
      deploymentId,
    );

    if (deployment.status !== DeploymentStatus.FAILED) {
      throw new BadRequestException(
        "AI diagnosis can only be generated for failed deployments.",
      );
    }

    const diagnosis = await this.prismaService.client.aiDiagnosis.upsert({
      where: {
        deploymentId,
      },
      create: {
        deploymentId,
        status: AiDiagnosisStatus.PENDING,
        provider: "gemini",
        model: this.diagnosisModel,
      },
      update: {
        status: AiDiagnosisStatus.PENDING,
        failureSummary: null,
        likelyRootCause: null,
        relevantLogLines: [],
        recommendedFixes: [],
        confidence: null,
        provider: "gemini",
        model: this.diagnosisModel,
        errorMessage: null,
        completedAt: null,
      },
    });

    try {
      const logs = await this.getDeploymentLogs(deploymentId);

      if (!logs) {
        throw new BadRequestException(
          "This deployment does not contain enough logs for diagnosis.",
        );
      }

      const generatedDiagnosis = await this.generateGeminiDiagnosis({
        deploymentId,
        failureMessage:
          this.sanitizeText(deployment.errorMessage ?? "") ||
          "No final failure message was stored.",
        logs,
      });

      return await this.prismaService.client.aiDiagnosis.update({
        where: {
          id: diagnosis.id,
        },
        data: {
          status: AiDiagnosisStatus.COMPLETED,
          failureSummary: generatedDiagnosis.failureSummary,
          likelyRootCause: generatedDiagnosis.likelyRootCause,
          relevantLogLines: generatedDiagnosis.relevantLogLines,
          recommendedFixes: generatedDiagnosis.recommendedFixes,
          confidence: generatedDiagnosis.confidence,
          provider: "gemini",
          model: this.diagnosisModel,
          errorMessage: null,
          completedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      await this.prismaService.client.aiDiagnosis.update({
        where: {
          id: diagnosis.id,
        },
        data: {
          status: AiDiagnosisStatus.FAILED,
          errorMessage: errorMessage.slice(0, 2_000),
          completedAt: null,
        },
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        errorMessage.includes("API key") ||
        errorMessage.includes("API_KEY_INVALID") ||
        errorMessage.includes("403")
      ) {
        throw new ServiceUnavailableException(
          "Gemini authentication failed. Check GEMINI_API_KEY.",
        );
      }

      throw new BadGatewayException(
        "Gemini could not generate the deployment diagnosis.",
      );
    }
  }

  private async verifyDeploymentOwnership(
    userId: string,
    deploymentId: string,
  ) {
    const deployment = await this.prismaService.client.deployment.findFirst({
      where: {
        id: deploymentId,
        project: {
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        errorMessage: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException("Deployment not found.");
    }

    return deployment;
  }

  private async getDeploymentLogs(deploymentId: string): Promise<string> {
    const logs = await this.prismaService.client.deploymentLog.findMany({
      where: {
        deploymentId,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: MAX_LOGS,
      select: {
        level: true,
        stage: true,
        message: true,
        createdAt: true,
      },
    });

    const prioritizedLogs = logs.filter(
      (log) =>
        log.level === DeploymentLogLevel.ERROR ||
        log.level === DeploymentLogLevel.WARN,
    );

    const selectedLogs =
      prioritizedLogs.length > 0
        ? [...logs.slice(-50), ...prioritizedLogs].filter(
            (log, index, collection) =>
              collection.findIndex(
                (candidate) =>
                  candidate.createdAt.getTime() === log.createdAt.getTime() &&
                  candidate.message === log.message,
              ) === index,
          )
        : logs.slice(-100);

    return selectedLogs
      .map((log) => {
        const message = this.sanitizeText(log.message).slice(
          0,
          MAX_LOG_MESSAGE_LENGTH,
        );

        return [
          `[${log.createdAt.toISOString()}]`,
          `[${log.level}]`,
          `[${log.stage}]`,
          message,
        ].join(" ");
      })
      .join("\n")
      .slice(0, MAX_TOTAL_LOG_LENGTH);
  }

  private async generateGeminiDiagnosis(input: {
    deploymentId: string;
    failureMessage: string;
    logs: string;
  }): Promise<GeneratedDiagnosis> {
    const prompt = `
You are DevPilot's deployment failure diagnostic assistant.

Analyze only the supplied failure message and deployment logs.
Do not invent missing evidence.
Return practical fixes suitable for a software developer.

Requirements:
- Summarize the failure briefly.
- Identify the most likely root cause.
- Include only relevant log lines that exist in the supplied logs.
- Return between 1 and 5 recommended fixes.
- Confidence must be between 0 and 1.
- Never reproduce passwords, API keys, tokens, or connection strings.

Deployment ID:
${input.deploymentId}

Final failure message:
${input.failureMessage}

Deployment logs:
${input.logs}
`.trim();

    const response = await this.geminiClient.models.generateContent({
      model: this.diagnosisModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "failureSummary",
            "likelyRootCause",
            "relevantLogLines",
            "recommendedFixes",
            "confidence",
          ],
          properties: {
            failureSummary: {
              type: Type.STRING,
            },
            likelyRootCause: {
              type: Type.STRING,
            },
            relevantLogLines: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
            recommendedFixes: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
            confidence: {
              type: Type.NUMBER,
            },
          },
        },
      },
    });

    const responseText = response.text;

    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(responseText) as Partial<GeneratedDiagnosis>;

    return this.validateGeneratedDiagnosis(parsed);
  }

  private validateGeneratedDiagnosis(
    value: Partial<GeneratedDiagnosis>,
  ): GeneratedDiagnosis {
    if (
      typeof value.failureSummary !== "string" ||
      typeof value.likelyRootCause !== "string" ||
      !Array.isArray(value.relevantLogLines) ||
      !Array.isArray(value.recommendedFixes) ||
      typeof value.confidence !== "number"
    ) {
      throw new Error("Gemini returned an invalid diagnosis structure.");
    }

    return {
      failureSummary: this.sanitizeText(value.failureSummary).slice(0, 2_000),
      likelyRootCause: this.sanitizeText(value.likelyRootCause).slice(0, 4_000),
      relevantLogLines: value.relevantLogLines
        .filter((line): line is string => typeof line === "string")
        .map((line) => this.sanitizeText(line).slice(0, 2_000))
        .filter(Boolean)
        .slice(0, 10),
      recommendedFixes: value.recommendedFixes
        .filter((fix): fix is string => typeof fix === "string")
        .map((fix) => this.sanitizeText(fix).slice(0, 2_000))
        .filter(Boolean)
        .slice(0, 5),
      confidence: Math.min(1, Math.max(0, value.confidence)),
    };
  }

  private sanitizeText(value: string): string {
    return value
      .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, "$1[REDACTED]")
      .replace(
        /\b(sk-[a-zA-Z0-9_-]{10,}|AIza[a-zA-Z0-9_-]{20,})\b/g,
        "[REDACTED_API_KEY]",
      )
      .replace(
        /((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
        "$1[REDACTED]",
      )
      .replace(
        /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/gi,
        "[REDACTED_CONNECTION_STRING]",
      )
      .trim();
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown AI diagnosis error.";
  }
}
