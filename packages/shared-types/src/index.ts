export const deploymentStatuses = [
  "QUEUED",
  "CLONING",
  "ANALYZING",
  "BUILDING",
  "STARTING",
  "HEALTH_CHECKING",
  "READY",
  "FAILED",
  "CANCELLED",
  "STOPPED",
  "ROLLED_BACK",
] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];

export const DEPLOYMENT_QUEUE_NAME = "deployments";

export const DEPLOYMENT_JOB_NAME = "deploy-project";
export const STOP_DEPLOYMENT_JOB_NAME = "stop-deployment";
export const RESTART_DEPLOYMENT_JOB_NAME = "restart-deployment";

export type DeploymentJobName =
  | typeof DEPLOYMENT_JOB_NAME
  | typeof STOP_DEPLOYMENT_JOB_NAME
  | typeof RESTART_DEPLOYMENT_JOB_NAME;

export type ProcessDeploymentJobData = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  branch: string;
  rootDirectory: string;
  requestedAt: string;
};

export type StopDeploymentJobData = {
  deploymentId: string;
  containerId: string;
  requestedAt: string;
};

export type RestartDeploymentJobData = {
  deploymentId: string;
  imageTag: string;
  applicationPort: number;
  requestedAt: string;
};

export type DeploymentJobData =
  | ProcessDeploymentJobData
  | StopDeploymentJobData
  | RestartDeploymentJobData;

export type DeploymentJobResult = {
  success: boolean;
  message: string;
  processedAt: string;
};
