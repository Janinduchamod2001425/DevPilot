import type {
  Deployment,
  DeploymentLog,
  HealthResponse,
  Project,
} from "~/types/api";

export function useDevPilotApi() {
  const config = useRuntimeConfig();
  const apiBaseUrl = config.public.apiBaseUrl;

  function getHealth() {
    return $fetch<HealthResponse>(`${apiBaseUrl}/health`);
  }

  function getProjects() {
    return $fetch<Project[]>(`${apiBaseUrl}/projects`);
  }

  function getProject(projectId: string) {
    return $fetch<Project>(`${apiBaseUrl}/projects/${projectId}`);
  }

  function getProjectDeployments(projectId: string) {
    return $fetch<Deployment[]>(
      `${apiBaseUrl}/projects/${projectId}/deployments`,
    );
  }

  function getDeployment(deploymentId: string) {
    return $fetch<Deployment>(`${apiBaseUrl}/deployments/${deploymentId}`);
  }

  function createDeployment(projectId: string) {
    return $fetch<Deployment>(`${apiBaseUrl}/deployments`, {
      method: "POST",
      body: {
        projectId,
      },
    });
  }

  function stopDeployment(deploymentId: string) {
    return $fetch<Deployment>(
      `${apiBaseUrl}/deployments/${deploymentId}/stop`,
      {
        method: "POST",
      },
    );
  }

  function restartDeployment(deploymentId: string) {
    return $fetch<Deployment>(
      `${apiBaseUrl}/deployments/${deploymentId}/restart`,
      {
        method: "POST",
      },
    );
  }

  function getDeploymentLogs(deploymentId: string) {
    return $fetch<DeploymentLog[]>(
      `${apiBaseUrl}/deployments/${deploymentId}/logs`,
    );
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
