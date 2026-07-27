import type {
  AuthResponse,
  Deployment,
  DeploymentLog,
  GitHubInstallation,
  GitHubRepositoriesResponse,
  HealthResponse,
  ImportProjectPayload,
  ImportProjectResponse,
  LogoutResponse,
  Project,
} from "~/types/api";

export function useDevPilotApi() {
  const config = useRuntimeConfig();

  const authUser = useState("auth-user", () => null);
  const authInitialized = useState("auth-initialized", () => false);

  /*
   * During SSR, Nuxt calls the API from the server—not directly from
   * the browser. Therefore, forward the browser's session cookie.
   */
  const requestHeaders = import.meta.server
    ? useRequestHeaders(["cookie"])
    : undefined;

  const api = $fetch.create({
    baseURL: config.public.apiBaseUrl,
    credentials: "include",
    headers: requestHeaders,

    async onResponseError({ request, response }) {
      if (response.status !== 401) {
        return;
      }

      const requestUrl =
        typeof request === "string" ? request : request.toString();

      /*
       * A 401 from /auth/me is a normal logged-out response.
       * useAuth() already handles it during initialization.
       */
      if (requestUrl.includes("/auth/me")) {
        return;
      }

      authUser.value = null;
      authInitialized.value = true;

      if (!import.meta.client) {
        return;
      }

      if (window.location.pathname === "/login") {
        return;
      }

      const returnTo =
        window.location.pathname +
        window.location.search +
        window.location.hash;

      await navigateTo(
        {
          path: "/login",
          query: {
            expired: "true",
            redirect: returnTo,
          },
        },
        {
          replace: true,
        },
      );
    },
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

  function getGitHubInstallUrl(): string {
    return `${config.public.apiBaseUrl}/github/install`;
  }

  function installGitHubApp(): void {
    if (!import.meta.client) {
      return;
    }

    window.location.assign(getGitHubInstallUrl());
  }

  function getGitHubInstallations(): Promise<GitHubInstallation[]> {
    return api<GitHubInstallation[]>("/github/installations");
  }

  function getGitHubRepositories(
    installationId: string,
  ): Promise<GitHubRepositoriesResponse> {
    return api<GitHubRepositoriesResponse>("/github/repositories", {
      query: {
        installationId,
      },
    });
  }

  function importProject(
    payload: ImportProjectPayload,
  ): Promise<ImportProjectResponse> {
    return api<ImportProjectResponse>("/projects/import", {
      method: "POST",
      body: payload,
    });
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

    getGitHubInstallUrl,
    installGitHubApp,
    getGitHubInstallations,
    getGitHubRepositories,
    importProject,
  };
}
