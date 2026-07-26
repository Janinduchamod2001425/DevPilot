import type {
  Deployment,
  DeploymentLog,
  HealthResponse,
  Project,
} from "~/types/api";

export function useDevPilotApi() {
  const config = useRuntimeConfig();

  const api = $fetch.create({
    baseURL: config.public.apiBaseUrl,
    credentials: "include",
  });

  function getHealth() {
    return api<HealthResponse>("/health");
  }

  function getProjects() {
    return api<Project[]>("/projects");
  }

  function getProject(projectId: string) {
    return api<Project>(`/projects/${projectId}`);
  }

  function getProjectDeployments(projectId: string) {
    return api<Deployment[]>(`/projects/${projectId}/deployments`);
  }

  function getDeployment(deploymentId: string) {
    return api<Deployment>(`/deployments/${deploymentId}`);
  }

  function createDeployment(projectId: string) {
    return api<Deployment>("/deployments", {
      method: "POST",
      body: {
        projectId,
      },
    });
  }

  function stopDeployment(deploymentId: string) {
    return api<Deployment>(`/deployments/${deploymentId}/stop`, {
      method: "POST",
    });
  }

  function restartDeployment(deploymentId: string) {
    return api<Deployment>(`/deployments/${deploymentId}/restart`, {
      method: "POST",
    });
  }

  function getDeploymentLogs(deploymentId: string) {
    return api<DeploymentLog[]>(`/deployments/${deploymentId}/logs`);
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
  };
}
