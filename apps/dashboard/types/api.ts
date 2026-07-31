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

export type GitHubAccountType = "USER" | "ORGANIZATION";

export interface GitHubInstallation {
  id: string;
  installationId: string;
  accountId: string;
  accountLogin: string;
  accountType: GitHubAccountType;
  avatarUrl: string | null;
  repositorySelection: string;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepositoryOwner {
  id: string;
  login: string;
  avatarUrl: string | null;
}

export interface GitHubRepository {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  owner: GitHubRepositoryOwner;
}

export interface GitHubRepositoriesResponse {
  installation: {
    id: string;
    installationId: string;
    accountLogin: string;
    accountType: GitHubAccountType;
    avatarUrl: string | null;
  };
  repositories: GitHubRepository[];
}

export interface RootDirectoryCandidate {
  rootDirectory: string;
  deployable: boolean;
  framework: string | null;
  packageManager: string | null;
  markers: string[];
}

export interface RootDirectoriesResponse {
  repository: {
    id: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
  recommendedRootDirectory: string;
  candidates: RootDirectoryCandidate[];
  treeTruncated: boolean;
}

export interface ImportProjectPayload {
  installationId: string;
  repositoryId: string;
  rootDirectory: string;
}

export interface ImportProjectResponse {
  project: Project;
  deployment: Deployment | null;
  deploymentWarning?: string;
}
