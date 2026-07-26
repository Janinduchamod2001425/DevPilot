export type DeploymentStatus =
  | "QUEUED"
  | "CLONING"
  | "ANALYZING"
  | "BUILDING"
  | "STARTING"
  | "HEALTH_CHECKING"
  | "READY"
  | "FAILED"
  | "CANCELLED"
  | "STOPPED"
  | "ROLLED_BACK";

export type DeploymentLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  level: DeploymentLogLevel;
  stage: string;
  message: string;
  createdAt: string;
}

export interface Deployment {
  id: string;
  projectId?: string;
  status: DeploymentStatus;
  branch: string;
  commitSha: string | null;
  commitMessage: string | null;
  imageTag: string | null;
  containerId: string | null;
  assignedPort: number | null;
  liveUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryUrl: string;
  productionBranch: string;
  rootDirectory: string;
  createdAt: string;
  updatedAt: string;
  deployments: Deployment[];
  _count: {
    deployments: number;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
}

export type AuthenticatedUser = {
  id: string;
  githubId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AuthenticatedUser | null;
};

export type LogoutResponse = {
  success: true;
};
