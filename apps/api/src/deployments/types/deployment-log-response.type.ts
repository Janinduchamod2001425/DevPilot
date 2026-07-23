import type { DeploymentLog, DeploymentLogLevel } from "@devpilot/database";

export type DeploymentLogResponse = DeploymentLog;

export interface CreateDeploymentLogInput {
  deploymentId: string;
  level?: DeploymentLogLevel;
  stage: string;
  message: string;
}
