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
