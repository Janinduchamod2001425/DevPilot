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

export type DeploymentJobName = typeof DEPLOYMENT_JOB_NAME;

export type DeploymentJobData = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  branch: string;
  rootDirectory: string;
  requestedAt: string;
};

export type DeploymentJobResult = {
  success: boolean;
  message: string;
  processedAt: string;
};
