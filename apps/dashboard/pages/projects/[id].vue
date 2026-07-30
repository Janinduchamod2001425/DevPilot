<script lang="ts" setup>
import type {
  Deployment,
  DeploymentLog,
  DeploymentLogLevel,
  DeploymentStatus,
  Project,
  RootDirectoryCandidate,
} from "~/types/api";
import { Icon } from "@iconify/vue";
import { useAppToast } from "~/composables/useAppToast";

const route = useRoute();
const api = useDevPilotApi();

const toast = useAppToast();

const projectId = computed(() => route.params.id as string);

const project = ref<Project | null>(null);
const deployments = ref<Deployment[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const actionLoading = ref<"deploy" | "stop" | "restart" | null>(null);
const errorMessage = ref("");

const settingsOpen = ref(false);
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const rootDirectories = ref<RootDirectoryCandidate[]>([]);
const selectedRootDirectory = ref("");
const recommendedRootDirectory = ref("");
const treeTruncated = ref(false);

const selectedDeploymentId = ref<string | null>(null);
const deploymentLogs = ref<DeploymentLog[]>([]);
const logsLoading = ref(false);
const logsRefreshing = ref(false);
const logsErrorMessage = ref("");
const terminalElement = ref<HTMLElement | null>(null);

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let logPollingTimer: ReturnType<typeof setInterval> | null = null;

const selectedRootCandidate = computed(() => {
  return (
    rootDirectories.value.find(
      (candidate) => candidate.rootDirectory === selectedRootDirectory.value,
    ) ?? null
  );
});

const rootDirectoryChanged = computed(() => {
  return (
    project.value !== null &&
    selectedRootDirectory.value !== project.value.rootDirectory
  );
});

const canSaveRootDirectory = computed(() => {
  return Boolean(
    selectedRootCandidate.value?.deployable &&
      rootDirectoryChanged.value &&
      !settingsLoading.value &&
      !settingsSaving.value &&
      !isDeploymentActive.value,
  );
});

const activeStatuses: DeploymentStatus[] = [
  "QUEUED",
  "CLONING",
  "ANALYZING",
  "BUILDING",
  "STARTING",
  "HEALTH_CHECKING",
];

const latestDeployment = computed(() => deployments.value[0] ?? null);
const selectedDeployment = computed(() => {
  if (!selectedDeploymentId.value) return null;
  return (
    deployments.value.find((d) => d.id === selectedDeploymentId.value) ?? null
  );
});
const isSelectedDeploymentActive = computed(() => {
  const status = selectedDeployment.value?.status;
  return status ? activeStatuses.includes(status) : false;
});
const isDeploymentActive = computed(() => {
  const status = latestDeployment.value?.status;
  return status ? activeStatuses.includes(status) : false;
});
const canStop = computed(
  () =>
    latestDeployment.value?.status === "READY" && actionLoading.value === null,
);
const canRestart = computed(() => {
  const d = latestDeployment.value;
  if (!d || actionLoading.value !== null) return false;
  return (
    (d.status === "STOPPED" || d.status === "FAILED") && Boolean(d.imageTag)
  );
});
const canDeploy = computed(
  () => !isDeploymentActive.value && actionLoading.value === null,
);

function getRequestError(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const e = error as {
    data?: { message?: string | string[] };
    message?: string;
  };
  const msg = e.data?.message;
  return Array.isArray(msg) ? msg.join(", ") : (msg ?? e.message ?? fallback);
}

async function loadProject(
  showLoader = true,
  showSuccessToast = false,
): Promise<void> {
  if (showLoader) {
    loading.value = true;
  } else {
    refreshing.value = true;
  }

  errorMessage.value = "";

  try {
    const [projectResult, deploymentsResult] = await Promise.all([
      api.getProject(projectId.value),
      api.getProjectDeployments(projectId.value),
    ]);

    project.value = projectResult;
    deployments.value = deploymentsResult;

    if (
      !selectedDeploymentId.value ||
      !deployments.value.some(
        (deployment) => deployment.id === selectedDeploymentId.value,
      )
    ) {
      selectedDeploymentId.value = deployments.value[0]?.id ?? null;
    }

    if (selectedDeploymentId.value) {
      await loadDeploymentLogs(selectedDeploymentId.value);
    }

    updatePolling();
    updateLogPolling();

    if (showSuccessToast) {
      toast.success(
        "Project refreshed",
        "The latest deployment status and logs have been loaded.",
      );
    }
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "The project could not be loaded.",
    );

    toast.error("Project could not be loaded", errorMessage.value);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshDeployments() {
  try {
    deployments.value = await api.getProjectDeployments(projectId.value);
    updatePolling();
    updateLogPolling();
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "Deployment status could not be refreshed.",
    );
  }
}

async function openSettings(): Promise<void> {
  settingsOpen.value = true;
  settingsLoading.value = true;
  errorMessage.value = "";

  try {
    const result = await api.getProjectRootDirectories(projectId.value);

    rootDirectories.value = result.candidates;
    recommendedRootDirectory.value = result.recommendedRootDirectory;
    treeTruncated.value = result.treeTruncated;

    selectedRootDirectory.value =
      project.value?.rootDirectory ?? result.recommendedRootDirectory;
  } catch (error) {
    const message = getRequestError(
      error,
      "Root directories could not be loaded.",
    );

    errorMessage.value = message;
    toast.error("Settings could not be loaded", message);
  } finally {
    settingsLoading.value = false;
  }
}

function closeSettings(): void {
  if (settingsSaving.value) return;

  settingsOpen.value = false;
  rootDirectories.value = [];
  selectedRootDirectory.value = "";
}

async function saveRootDirectory(redeploy: boolean): Promise<void> {
  if (!canSaveRootDirectory.value || !project.value) {
    return;
  }

  settingsSaving.value = true;
  errorMessage.value = "";

  const toastId = toast.loading(
    redeploy
      ? "Saving configuration and creating deployment..."
      : "Saving project configuration...",
  );

  try {
    const updatedProject = await api.updateProjectRootDirectory(
      projectId.value,
      selectedRootDirectory.value,
    );

    project.value = {
      ...project.value,
      ...updatedProject,
    };

    if (redeploy) {
      const deployment = await api.createDeployment(projectId.value);

      deployments.value = [
        deployment,
        ...deployments.value.filter((item) => item.id !== deployment.id),
      ];

      selectedDeploymentId.value = deployment.id;
      deploymentLogs.value = [];

      await loadDeploymentLogs(deployment.id);

      startPolling();
      startLogPolling();
    }

    toast.dismiss(toastId);
    toast.success(
      redeploy
        ? "Configuration saved and deployment created"
        : "Configuration saved",
      redeploy
        ? `The new deployment will use ./${selectedRootDirectory.value}.`
        : "Future deployments will use the selected root directory.",
    );

    closeSettings();
  } catch (error) {
    const message = getRequestError(
      error,
      redeploy
        ? "The configuration or deployment could not be completed."
        : "The project configuration could not be saved.",
    );

    errorMessage.value = message;

    toast.dismiss(toastId);
    toast.error("Settings update failed", message);
  } finally {
    settingsSaving.value = false;
  }
}

async function deployProject(): Promise<void> {
  if (!canDeploy.value) return;

  actionLoading.value = "deploy";
  errorMessage.value = "";

  const toastId = toast.loading("Creating deployment...");

  try {
    const deployment = await api.createDeployment(projectId.value);

    deployments.value = [
      deployment,
      ...deployments.value.filter((item) => item.id !== deployment.id),
    ];

    selectedDeploymentId.value = deployment.id;
    deploymentLogs.value = [];

    await loadDeploymentLogs(deployment.id);

    startPolling();
    startLogPolling();

    toast.dismiss(toastId);
    toast.success(
      "Deployment created",
      "The deployment has been added to the build queue.",
    );
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be started.",
    );

    toast.dismiss(toastId);
    toast.error("Deployment failed", errorMessage.value);
  } finally {
    actionLoading.value = null;
  }
}

async function stopLatestDeployment(): Promise<void> {
  const deployment = latestDeployment.value;

  if (!deployment || !canStop.value) return;

  actionLoading.value = "stop";
  errorMessage.value = "";

  const toastId = toast.loading("Stopping deployment...");

  try {
    await api.stopDeployment(deployment.id);
    await refreshDeployments();

    toast.dismiss(toastId);
    toast.success(
      "Deployment stopped",
      "The running application has been stopped successfully.",
    );
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be stopped.",
    );

    toast.dismiss(toastId);
    toast.error("Stop failed", errorMessage.value);
  } finally {
    actionLoading.value = null;
  }
}

async function restartLatestDeployment(): Promise<void> {
  const deployment = latestDeployment.value;

  if (!deployment || !canRestart.value) return;

  actionLoading.value = "restart";
  errorMessage.value = "";

  const toastId = toast.loading("Restarting deployment...");

  try {
    const updated = await api.restartDeployment(deployment.id);

    replaceDeployment(updated);
    selectedDeploymentId.value = updated.id;

    await loadDeploymentLogs(updated.id, false);

    startPolling();
    startLogPolling();

    toast.dismiss(toastId);
    toast.success("Restart requested", "The application is starting again.");
  } catch (error) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be restarted.",
    );

    toast.dismiss(toastId);
    toast.error("Restart failed", errorMessage.value);
  } finally {
    actionLoading.value = null;
  }
}

function replaceDeployment(updated: Deployment) {
  const idx = deployments.value.findIndex((d) => d.id === updated.id);
  if (idx === -1) deployments.value.unshift(updated);
  else deployments.value[idx] = updated;
}

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(() => {
    void refreshDeployments();
  }, 2000);
}
function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
function updatePolling() {
  if (isDeploymentActive.value || actionLoading.value === "stop")
    startPolling();
  else stopPolling();
}

async function loadDeploymentLogs(deploymentId: string, showLoader = true) {
  if (showLoader) logsLoading.value = true;
  else logsRefreshing.value = true;
  logsErrorMessage.value = "";
  try {
    const logs = await api.getDeploymentLogs(deploymentId);
    if (selectedDeploymentId.value !== deploymentId) return;
    deploymentLogs.value = logs;
    await nextTick();
    scrollTerminalToBottom();
  } catch (error) {
    if (selectedDeploymentId.value === deploymentId) {
      logsErrorMessage.value = getRequestError(
        error,
        "Deployment logs could not be loaded.",
      );
    }
  } finally {
    if (selectedDeploymentId.value === deploymentId) {
      logsLoading.value = false;
      logsRefreshing.value = false;
    }
  }
}

async function selectDeployment(deploymentId: string) {
  if (
    selectedDeploymentId.value === deploymentId &&
    deploymentLogs.value.length
  )
    return;
  stopLogPolling();
  selectedDeploymentId.value = deploymentId;
  deploymentLogs.value = [];
  logsErrorMessage.value = "";
  await loadDeploymentLogs(deploymentId);
  updateLogPolling();
}

function startLogPolling() {
  if (logPollingTimer || !selectedDeploymentId.value) return;
  logPollingTimer = setInterval(() => {
    if (selectedDeploymentId.value)
      void loadDeploymentLogs(selectedDeploymentId.value, false);
  }, 2000);
}
function stopLogPolling() {
  if (logPollingTimer) {
    clearInterval(logPollingTimer);
    logPollingTimer = null;
  }
}
function updateLogPolling() {
  if (isSelectedDeploymentActive.value) startLogPolling();
  else stopLogPolling();
}

function scrollTerminalToBottom() {
  if (terminalElement.value)
    terminalElement.value.scrollTop = terminalElement.value.scrollHeight;
}

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
function getLogLevelClass(level: DeploymentLogLevel) {
  switch (level) {
    case "ERROR":
      return "text-rose-400";
    case "WARN":
      return "text-amber-300";
    case "DEBUG":
      return "text-slate-500";
    default:
      return "text-emerald-300";
  }
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
function shortCommit(sha: string | null) {
  return sha?.slice(0, 8) ?? "—";
}

onMounted(() => {
  void loadProject();
});
onBeforeUnmount(() => {
  stopPolling();
  stopLogPolling();
});
</script>

<template>
  <main class="px-6 py-10">
    <div class="mx-auto max-w-7xl">
      <NuxtLink
        class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        to="/"
      >
        <Icon class="h-4 w-4" icon="mdi:arrow-left" /> Back to projects
      </NuxtLink>

      <div v-if="loading" class="mt-8 space-y-6">
        <div
          class="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
        />
        <div
          class="h-72 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
        />
      </div>

      <div
        v-else-if="!project"
        class="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6"
      >
        <h1 class="text-xl font-semibold text-rose-200">Project unavailable</h1>
        <p class="mt-2 text-sm text-rose-300">
          {{ errorMessage || "The requested project was not found." }}
        </p>
      </div>

      <template v-else>
        <!-- Project Overview -->
        <section
          v-motion
          :enter="{ opacity: 1, y: 0 }"
          :initial="{ opacity: 0, y: 20 }"
          class="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm sm:p-8"
        >
          <div
            class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-3">
                <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
                  {{ project.name }}
                </h1>
                <StatusBadge :status="latestDeployment?.status" />
              </div>
              <a
                :href="project.repositoryUrl"
                class="mt-3 inline-block text-sm text-cyan-400 transition hover:text-cyan-300"
                rel="noopener noreferrer"
                target="_blank"
              >
                {{ project.repositoryOwner }}/{{ project.repositoryName }}
                <Icon class="inline h-3 w-3" icon="mdi:arrow-top-right" />
              </a>
              <div class="mt-6 flex flex-wrap gap-x-8 gap-y-4 text-sm">
                <div>
                  <p class="text-slate-500">Production branch</p>
                  <p class="mt-1 font-medium text-slate-200">
                    {{ project.productionBranch }}
                  </p>
                </div>
                <div>
                  <p class="text-slate-500">Root directory</p>
                  <p class="mt-1 font-medium text-slate-200">
                    {{ project.rootDirectory }}
                  </p>
                </div>
                <div>
                  <p class="text-slate-500">Total deployments</p>
                  <p class="mt-1 font-medium text-slate-200">
                    {{ project._count.deployments }}
                  </p>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button
                :disabled="actionLoading !== null"
                class="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold transition hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
                type="button"
                @click="openSettings"
              >
                <Icon class="h-4 w-4" icon="mdi:cog-outline" />
                Settings
              </button>
              <button
                :disabled="refreshing || actionLoading !== null"
                class="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold transition hover:border-slate-500 disabled:opacity-50"
                @click="loadProject(false, true)"
              >
                <Icon v-if="!refreshing" class="h-4 w-4" icon="mdi:refresh" />
                <span
                  v-else
                  class="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-400"
                />
                {{ refreshing ? "Refreshing…" : "Refresh" }}
              </button>
              <button
                v-if="latestDeployment?.status === 'READY'"
                :disabled="!canStop"
                class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                @click="stopLatestDeployment"
              >
                {{ actionLoading === "stop" ? "Stopping…" : "Stop" }}
              </button>
              <button
                v-if="
                  latestDeployment?.status === 'STOPPED' ||
                  latestDeployment?.status === 'FAILED'
                "
                :disabled="!canRestart"
                class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                @click="restartLatestDeployment"
              >
                {{ actionLoading === "restart" ? "Restarting…" : "Restart" }}
              </button>
              <a
                v-if="
                  latestDeployment?.status === 'READY' &&
                  latestDeployment.liveUrl
                "
                :href="latestDeployment.liveUrl"
                class="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                rel="noopener noreferrer"
                target="_blank"
              >
                Visit site
                <Icon class="inline h-3 w-3" icon="mdi:arrow-top-right" />
              </a>
              <button
                :disabled="!canDeploy"
                class="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                @click="deployProject"
              >
                {{
                  actionLoading === "deploy"
                    ? "Deploying…"
                    : isDeploymentActive
                      ? "Deployment in progress"
                      : "Deploy"
                }}
              </button>
            </div>
          </div>
        </section>

        <div
          v-if="errorMessage"
          class="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200"
        >
          <p class="font-semibold">Request failed</p>
          <p class="mt-1 text-sm text-rose-300">{{ errorMessage }}</p>
        </div>

        <!-- Current Deployment -->
        <section
          v-if="latestDeployment"
          class="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm"
        >
          <div class="flex items-center justify-between gap-4">
            <div>
              <p
                class="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400"
              >
                Current deployment
              </p>
              <h2 class="mt-2 text-2xl font-bold">
                {{ latestDeployment.commitMessage || "Deployment" }}
              </h2>
            </div>
            <span
              v-if="isDeploymentActive"
              class="flex items-center gap-2 text-sm text-cyan-300"
            >
              <span class="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              Updating…
            </span>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl bg-slate-950/70 p-4">
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Commit
              </p>
              <p class="mt-2 font-mono text-sm text-slate-200">
                {{ shortCommit(latestDeployment.commitSha) }}
              </p>
            </div>
            <div class="rounded-xl bg-slate-950/70 p-4">
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Branch
              </p>
              <p class="mt-2 text-sm text-slate-200">
                {{ latestDeployment.branch }}
              </p>
            </div>
            <div class="rounded-xl bg-slate-950/70 p-4">
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Assigned port
              </p>
              <p class="mt-2 text-sm text-slate-200">
                {{ latestDeployment.assignedPort ?? "—" }}
              </p>
            </div>
            <div class="rounded-xl bg-slate-950/70 p-4">
              <p class="text-xs uppercase tracking-wide text-slate-500">
                Finished
              </p>
              <p class="mt-2 text-sm text-slate-200">
                {{ formatDate(latestDeployment.finishedAt) }}
              </p>
            </div>
          </div>
          <div
            v-if="latestDeployment.errorMessage"
            class="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4"
          >
            <p class="font-semibold text-rose-200">
              {{ latestDeployment.errorCode || "Deployment failed" }}
            </p>
            <p class="mt-1 text-sm text-rose-300">
              {{ latestDeployment.errorMessage }}
            </p>
          </div>
        </section>

        <!-- Logs -->
        <section
          v-if="selectedDeployment"
          class="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
        >
          <div
            class="flex flex-col gap-4 border-b border-slate-800 bg-slate-900/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex gap-1.5">
                  <span class="h-3 w-3 rounded-full bg-rose-400" /><span
                    class="h-3 w-3 rounded-full bg-amber-400"
                  /><span class="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <h2 class="font-semibold text-slate-200">Deployment logs</h2>
                <StatusBadge :status="selectedDeployment.status" />
              </div>
              <p class="mt-2 font-mono text-xs text-slate-500">
                {{ selectedDeployment.id }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span
                v-if="isSelectedDeploymentActive"
                class="flex items-center gap-2 text-xs text-cyan-300"
              >
                <span class="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                Live
              </span>
              <span v-else class="text-xs text-slate-500"
                >Deployment finished</span
              >
              <button
                :disabled="logsLoading || logsRefreshing"
                class="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                @click="loadDeploymentLogs(selectedDeployment.id, false)"
              >
                <Icon
                  v-if="!logsRefreshing"
                  class="h-3 w-3"
                  icon="mdi:refresh"
                />
                <span
                  v-else
                  class="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-white"
                />
                {{ logsRefreshing ? "Refreshing…" : "Refresh logs" }}
              </button>
            </div>
          </div>
          <div
            ref="terminalElement"
            class="h-[460px] overflow-y-auto p-5 font-mono text-xs leading-6 sm:text-sm"
          >
            <div
              v-if="logsLoading"
              class="flex h-full items-center justify-center text-slate-500"
            >
              Loading deployment logs…
            </div>
            <div
              v-else-if="logsErrorMessage"
              class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300"
            >
              {{ logsErrorMessage }}
            </div>
            <div
              v-else-if="deploymentLogs.length === 0"
              class="flex h-full items-center justify-center text-slate-500"
            >
              Waiting for deployment output…
            </div>
            <div v-else>
              <div
                v-for="log in deploymentLogs"
                :key="log.id"
                class="grid grid-cols-[70px_100px_minmax(0,1fr)] gap-3 border-b border-slate-900 py-1 last:border-0"
              >
                <span class="text-slate-600">{{
                  formatLogTime(log.createdAt)
                }}</span>
                <span
                  :class="getLogLevelClass(log.level)"
                  class="truncate font-semibold"
                  >[{{ log.stage }}]</span
                >
                <span
                  :class="
                    log.level === 'ERROR'
                      ? 'text-rose-300'
                      : log.level === 'WARN'
                        ? 'text-amber-200'
                        : 'text-slate-300'
                  "
                  class="whitespace-pre-wrap break-words"
                  >{{ log.message }}</span
                >
              </div>
            </div>
          </div>
        </section>

        <!-- History -->
        <section class="mt-8">
          <div class="flex items-center justify-between">
            <div>
              <p
                class="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400"
              >
                History
              </p>
              <h2 class="mt-2 text-2xl font-bold">Deployment history</h2>
            </div>
            <p class="text-sm text-slate-500">
              {{ deployments.length }} deployment{{
                deployments.length === 1 ? "" : "s"
              }}
            </p>
          </div>
          <div
            v-if="deployments.length === 0"
            class="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center"
          >
            <h3 class="text-lg font-semibold">No deployments yet</h3>
            <p class="mt-2 text-sm text-slate-400">
              Start the first deployment using the Deploy button.
            </p>
          </div>
          <div v-else class="mt-6 space-y-4">
            <article
              v-for="(deployment, idx) in deployments"
              :key="deployment.id"
              v-motion
              :class="
                selectedDeploymentId === deployment.id
                  ? 'border-cyan-500/50 bg-cyan-500/5'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              "
              :delay="idx * 60"
              :enter="{ opacity: 1, y: 0 }"
              :initial="{ opacity: 0, y: 20 }"
              class="cursor-pointer rounded-2xl border p-5 transition"
              @click="selectDeployment(deployment.id)"
            >
              <div
                class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-3">
                    <StatusBadge :status="deployment.status" />
                    <span class="font-mono text-xs text-slate-500">{{
                      deployment.id
                    }}</span>
                  </div>
                  <p class="mt-3 truncate font-medium text-slate-200">
                    {{ deployment.commitMessage || "Commit not available" }}
                  </p>
                  <p class="mt-1 text-sm text-slate-500">
                    {{ shortCommit(deployment.commitSha) }} ·
                    {{ deployment.branch }} ·
                    {{ formatDate(deployment.createdAt) }}
                  </p>
                  <p
                    v-if="deployment.errorMessage"
                    class="mt-3 text-sm text-rose-300"
                  >
                    {{ deployment.errorMessage }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-4">
                  <button
                    class="text-sm font-semibold text-slate-400 transition hover:text-cyan-300"
                    @click.stop="selectDeployment(deployment.id)"
                  >
                    View logs
                  </button>
                  <a
                    v-if="deployment.status === 'READY' && deployment.liveUrl"
                    :href="deployment.liveUrl"
                    class="text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
                    rel="noopener noreferrer"
                    target="_blank"
                    @click.stop
                  >
                    Visit site
                    <Icon class="inline h-3 w-3" icon="mdi:arrow-top-right" />
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
    <Teleport to="body">
      <div
        v-if="settingsOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        @click.self="closeSettings"
      >
        <section
          class="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400"
              >
                Project settings
              </p>

              <h2 class="mt-2 text-2xl font-bold">Root directory</h2>

              <p class="mt-2 text-sm text-slate-400">
                Choose the directory containing the application that DevPilot
                should build.
              </p>
            </div>

            <button
              :disabled="settingsSaving"
              class="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
              type="button"
              @click="closeSettings"
            >
              <Icon class="h-5 w-5" icon="mdi:close" />
            </button>
          </div>

          <div
            v-if="settingsLoading"
            class="mt-8 flex items-center justify-center py-12 text-slate-400"
          >
            <span
              class="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400"
            />
            Inspecting repository directories...
          </div>

          <div v-else class="mt-8">
            <label
              class="text-sm font-semibold text-slate-300"
              for="root-directory"
            >
              Root directory
            </label>

            <select
              id="root-directory"
              v-model="selectedRootDirectory"
              class="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-200 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option
                v-for="candidate in rootDirectories"
                :key="candidate.rootDirectory"
                :disabled="!candidate.deployable"
                :value="candidate.rootDirectory"
              >
                {{
                  candidate.rootDirectory === "."
                    ? "./ — Repository root"
                    : `./${candidate.rootDirectory}`
                }}
                {{
                  candidate.rootDirectory === recommendedRootDirectory
                    ? " — Recommended"
                    : ""
                }}
                {{ !candidate.deployable ? " — No project detected" : "" }}
              </option>
            </select>

            <div
              v-if="selectedRootCandidate"
              :class="
                selectedRootCandidate.deployable
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
              "
              class="mt-4 rounded-xl border p-4 text-sm"
            >
              <p class="font-semibold">
                {{
                  selectedRootCandidate.deployable
                    ? "Deployable project detected"
                    : "No supported project detected"
                }}
              </p>

              <p
                v-if="selectedRootCandidate.deployable"
                class="mt-1 opacity-80"
              >
                Framework:
                {{ selectedRootCandidate.framework ?? "Unknown" }}
                · Package manager:
                {{ selectedRootCandidate.packageManager ?? "Unknown" }}
              </p>

              <p
                v-if="selectedRootCandidate.markers.length"
                class="mt-2 font-mono text-xs opacity-70"
              >
                {{ selectedRootCandidate.markers.join(", ") }}
              </p>
            </div>

            <p v-if="treeTruncated" class="mt-3 text-xs text-amber-300">
              GitHub returned a truncated repository tree. Some deeply nested
              directories may be unavailable.
            </p>

            <p class="mt-4 text-xs text-slate-500">
              Changing this setting affects future deployments only. Previous
              deployment history will remain unchanged.
            </p>

            <p v-if="isDeploymentActive" class="mt-3 text-xs text-amber-300">
              Wait for the active deployment to finish before changing the root
              directory.
            </p>

            <div
              class="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
            >
              <button
                :disabled="settingsSaving"
                class="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold transition hover:border-slate-500 disabled:opacity-50"
                type="button"
                @click="closeSettings"
              >
                Cancel
              </button>

              <button
                :disabled="!canSaveRootDirectory"
                class="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                type="button"
                @click="saveRootDirectory(false)"
              >
                Save changes
              </button>

              <button
                :disabled="!canSaveRootDirectory"
                class="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                type="button"
                @click="saveRootDirectory(true)"
              >
                {{ settingsSaving ? "Saving..." : "Save & redeploy" }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>
