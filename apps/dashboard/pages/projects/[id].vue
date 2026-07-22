<script lang="ts" setup>
import type { Deployment, DeploymentStatus, Project } from "~/types/api";

const route = useRoute();
const api = useDevPilotApi();

const projectId = computed(() => route.params.id as string);

const project = ref<Project | null>(null);
const deployments = ref<Deployment[]>([]);

const loading = ref(true);
const refreshing = ref(false);
const actionLoading = ref<"deploy" | "stop" | "restart" | null>(null);
const errorMessage = ref("");

let pollingTimer: ReturnType<typeof setInterval> | null = null;

const activeStatuses: DeploymentStatus[] = [
  "QUEUED",
  "CLONING",
  "ANALYZING",
  "BUILDING",
  "STARTING",
  "HEALTH_CHECKING",
];

const latestDeployment = computed(() => deployments.value[0] ?? null);

const isDeploymentActive = computed(() => {
  const status = latestDeployment.value?.status;

  return status ? activeStatuses.includes(status) : false;
});

const canStop = computed(
  () =>
    latestDeployment.value?.status === "READY" && actionLoading.value === null,
);

const canRestart = computed(
  () =>
    latestDeployment.value?.status === "STOPPED" &&
    actionLoading.value === null,
);

const canDeploy = computed(
  () => !isDeploymentActive.value && actionLoading.value === null,
);

function getRequestError(error: unknown, fallbackMessage: string): string {
  if (typeof error !== "object" || error === null) {
    return fallbackMessage;
  }

  const possibleError = error as {
    data?: {
      message?: string | string[];
    };
    message?: string;
  };

  const apiMessage = possibleError.data?.message;

  if (Array.isArray(apiMessage)) {
    return apiMessage.join(", ");
  }

  return apiMessage ?? possibleError.message ?? fallbackMessage;
}

async function loadProject(showLoader = true) {
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

    updatePolling();
  } catch (error: unknown) {
    errorMessage.value = getRequestError(
      error,
      "The project could not be loaded.",
    );
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshDeployments() {
  try {
    deployments.value = await api.getProjectDeployments(projectId.value);

    updatePolling();
  } catch (error: unknown) {
    errorMessage.value = getRequestError(
      error,
      "Deployment status could not be refreshed.",
    );
  }
}

async function deployProject() {
  if (!canDeploy.value) {
    return;
  }

  actionLoading.value = "deploy";
  errorMessage.value = "";

  try {
    const deployment = await api.createDeployment(projectId.value);

    deployments.value = [
      deployment,
      ...deployments.value.filter((item) => item.id !== deployment.id),
    ];

    startPolling();
  } catch (error: unknown) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be started.",
    );
  } finally {
    actionLoading.value = null;
  }
}

async function stopLatestDeployment() {
  const deployment = latestDeployment.value;

  if (!deployment || !canStop.value) {
    return;
  }

  actionLoading.value = "stop";
  errorMessage.value = "";

  try {
    await api.stopDeployment(deployment.id);

    // The stop endpoint queues the operation, so continue polling
    // until the worker changes the status to STOPPED.
    startPolling();
    await refreshDeployments();
  } catch (error: unknown) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be stopped.",
    );
  } finally {
    actionLoading.value = null;
  }
}

async function restartLatestDeployment() {
  const deployment = latestDeployment.value;

  if (!deployment || !canRestart.value) {
    return;
  }

  actionLoading.value = "restart";
  errorMessage.value = "";

  try {
    const updatedDeployment = await api.restartDeployment(deployment.id);

    replaceDeployment(updatedDeployment);
    startPolling();
  } catch (error: unknown) {
    errorMessage.value = getRequestError(
      error,
      "The deployment could not be restarted.",
    );
  } finally {
    actionLoading.value = null;
  }
}

function replaceDeployment(updatedDeployment: Deployment) {
  const index = deployments.value.findIndex(
    (deployment) => deployment.id === updatedDeployment.id,
  );

  if (index === -1) {
    deployments.value.unshift(updatedDeployment);
    return;
  }

  deployments.value[index] = updatedDeployment;
}

function startPolling() {
  if (pollingTimer) {
    return;
  }

  pollingTimer = setInterval(() => {
    void refreshDeployments();
  }, 2000);
}

function stopPolling() {
  if (!pollingTimer) {
    return;
  }

  clearInterval(pollingTimer);
  pollingTimer = null;
}

function updatePolling() {
  if (isDeploymentActive.value || actionLoading.value === "stop") {
    startPolling();
  } else {
    stopPolling();
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortCommit(commitSha: string | null) {
  return commitSha?.slice(0, 8) ?? "—";
}

onMounted(() => {
  void loadProject();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <main class="px-6 py-10">
    <div class="mx-auto max-w-7xl">
      <NuxtLink
        class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        to="/"
      >
        ← Back to projects
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
        <section
          class="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8"
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
                {{ project.repositoryOwner }}/{{ project.repositoryName }} ↗
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
                :disabled="refreshing || actionLoading !== null"
                class="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                @click="loadProject(false)"
              >
                {{ refreshing ? "Refreshing..." : "Refresh" }}
              </button>

              <button
                v-if="latestDeployment?.status === 'READY'"
                :disabled="!canStop"
                class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                @click="stopLatestDeployment"
              >
                {{ actionLoading === "stop" ? "Stopping..." : "Stop" }}
              </button>

              <button
                v-if="latestDeployment?.status === 'STOPPED'"
                :disabled="!canRestart"
                class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                @click="restartLatestDeployment"
              >
                {{ actionLoading === "restart" ? "Restarting..." : "Restart" }}
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
                Visit site ↗
              </a>

              <button
                :disabled="!canDeploy"
                class="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                @click="deployProject"
              >
                {{
                  actionLoading === "deploy"
                    ? "Deploying..."
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
          <p class="mt-1 text-sm text-rose-300">
            {{ errorMessage }}
          </p>
        </div>

        <section
          v-if="latestDeployment"
          class="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
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

            <span v-if="isDeploymentActive" class="text-sm text-cyan-300">
              Updating automatically…
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
              v-for="deployment in deployments"
              :key="deployment.id"
              class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div
                class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-3">
                    <StatusBadge :status="deployment.status" />

                    <span class="font-mono text-xs text-slate-500">
                      {{ deployment.id }}
                    </span>
                  </div>

                  <p class="mt-3 truncate font-medium text-slate-200">
                    {{ deployment.commitMessage || "Commit not available" }}
                  </p>

                  <p class="mt-1 text-sm text-slate-500">
                    {{ shortCommit(deployment.commitSha) }}
                    · {{ deployment.branch }} ·
                    {{ formatDate(deployment.createdAt) }}
                  </p>

                  <p
                    v-if="deployment.errorMessage"
                    class="mt-3 text-sm text-rose-300"
                  >
                    {{ deployment.errorMessage }}
                  </p>
                </div>

                <a
                  v-if="deployment.status === 'READY' && deployment.liveUrl"
                  :href="deployment.liveUrl"
                  class="shrink-0 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Visit site ↗
                </a>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>
