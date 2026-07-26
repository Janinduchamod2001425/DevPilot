import type {
  AuthResponse,
  Deployment,
  DeploymentLog,
  HealthResponse,
  LogoutResponse,
  Project,
} from "~/types/api";

export function useDevPilotApi() {
  const config = useRuntimeConfig();

  const api = $fetch.create({
    baseURL: config.public.apiBaseUrl,
    credentials: "include",
  });

  function getHealth(): Promise<HealthResponse> {
    return api<HealthResponse>("/health");
  }

  function getProjects(): Promise<Project[]> {
    return api<Project[]>("/projects");
  }

  function getProject(projectId: string): Promise<Project> {
    return api<Project>(`/projects/${projectId}`);
  }

  function getProjectDeployments(projectId: string): Promise<Deployment[]> {
    return api<Deployment[]>(`/projects/${projectId}/deployments`);
  }

  function getDeployment(deploymentId: string): Promise<Deployment> {
    return api<Deployment>(`/deployments/${deploymentId}`);
  }

  function getDeploymentLogs(deploymentId: string): Promise<DeploymentLog[]> {
    return api<DeploymentLog[]>(`/deployments/${deploymentId}/logs`);
  }

  function createDeployment(projectId: string): Promise<Deployment> {
    return api<Deployment>("/deployments", {
      method: "POST",
      body: {
        projectId,
      },
    });
  }

  function stopDeployment(deploymentId: string): Promise<Deployment> {
    return api<Deployment>(`/deployments/${deploymentId}/stop`, {
      method: "POST",
    });
  }

  function restartDeployment(deploymentId: string): Promise<Deployment> {
    return api<Deployment>(`/deployments/${deploymentId}/restart`, {
      method: "POST",
    });
  }

  function getCurrentUser(): Promise<AuthResponse> {
    return api<AuthResponse>("/auth/me");
  }

  function logout(): Promise<LogoutResponse> {
    return api<LogoutResponse>("/auth/logout", {
      method: "POST",
    });
  }

  function getGitHubLoginUrl(returnTo = "/"): string {
    const safeReturnTo =
      returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

    return `${config.public.apiBaseUrl}/auth/github?returnTo=${encodeURIComponent(
      safeReturnTo,
    )}`;
  }

  function loginWithGitHub(returnTo = "/"): void {
    if (!import.meta.client) {
      return;
    }

    window.location.assign(getGitHubLoginUrl(returnTo));
  }

  return {
    getHealth,
    getProjects,
    getProject,
    getProjectDeployments,
    getDeployment,
    getDeploymentLogs,
    createDeployment,
    stopDeployment,
    restartDeployment,
    getCurrentUser,
    logout,
    getGitHubLoginUrl,
    loginWithGitHub,
  };
}
