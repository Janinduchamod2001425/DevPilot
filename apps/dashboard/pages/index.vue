<script lang="ts" setup>
import type { Project } from "~/types/api";
import { Icon } from "@iconify/vue";
import { useAppToast } from "~/composables/useAppToast";

useHead({ title: "Dashboard" });
const api = useDevPilotApi();
const toast = useAppToast();

const projects = ref<Project[]>([]);
const initialLoading = ref(true);
const refreshing = ref(false);
const errorMessage = ref("");
const apiConnected = ref(false);
const deletingProjectId = ref<string | null>(null);
const projectPendingDelete = ref<Project | null>(null);

let dashboardPollingTimer: ReturnType<typeof setInterval> | null = null;
let dashboardRefreshInProgress = false;

const DASHBOARD_POLL_INTERVAL = 5000;

async function loadDashboard(isManualRefresh = false): Promise<void> {
  if (isManualRefresh) {
    refreshing.value = true;
  } else {
    initialLoading.value = true;
  }

  errorMessage.value = "";

  try {
    const [healthResult, projectsResult] = await Promise.allSettled([
      api.getHealth(),
      api.getProjects(),
    ]);

    apiConnected.value = healthResult.status === "fulfilled";

    if (healthResult.status === "rejected" && isManualRefresh) {
      toast.warning(
        "API connection unavailable",
        "The dashboard could not connect to the DevPilot API.",
      );
    }

    if (projectsResult.status === "fulfilled") {
      projects.value = projectsResult.value;

      if (isManualRefresh) {
        toast.success(
          "Dashboard refreshed",
          `${projects.value.length} project${
            projects.value.length === 1 ? "" : "s"
          } loaded successfully.`,
        );
      }
    } else {
      errorMessage.value =
        "Projects could not be loaded. Check if the DevPilot API is running.";

      toast.error(
        "Projects could not be loaded",
        "Check whether the DevPilot API is running and try again.",
      );
    }
  } finally {
    initialLoading.value = false;
    refreshing.value = false;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getApiError(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;

  const value = error as {
    data?: { message?: unknown };
    message?: unknown;
  };

  if (typeof value.data?.message === "string") {
    return value.data.message;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return fallback;
}

function requestDeleteProject(project: Project): void {
  if (deletingProjectId.value !== null) return;
  projectPendingDelete.value = project;
}

async function deleteProject(): Promise<void> {
  const target = projectPendingDelete.value;

  if (!target || deletingProjectId.value !== null) return;

  deletingProjectId.value = target.id;

  try {
    await api.deleteProject(target.id);

    projectPendingDelete.value = null;

    toast.success(
      "Project deletion queued",
      "Docker cleanup is running in the background.",
    );

    window.setTimeout(() => void loadDashboard(), 1000);
    window.setTimeout(() => void loadDashboard(), 3000);
  } catch (error: unknown) {
    toast.error(
      "Could not delete project",
      getApiError(error, "Please try again."),
    );
  } finally {
    deletingProjectId.value = null;
  }
}

async function refreshDashboardSilently(): Promise<void> {
  if (dashboardRefreshInProgress || (import.meta.client && document.hidden)) {
    return;
  }

  dashboardRefreshInProgress = true;

  try {
    const [healthResult, projectsResult] = await Promise.allSettled([
      api.getHealth(),
      api.getProjects(),
    ]);

    apiConnected.value = healthResult.status === "fulfilled";

    if (projectsResult.status === "fulfilled") {
      projects.value = projectsResult.value;
      errorMessage.value = "";
    }
  } finally {
    dashboardRefreshInProgress = false;
  }
}

function startDashboardPolling(): void {
  if (dashboardPollingTimer) return;

  dashboardPollingTimer = setInterval(() => {
    void refreshDashboardSilently();
  }, DASHBOARD_POLL_INTERVAL);
}

function stopDashboardPolling(): void {
  if (!dashboardPollingTimer) return;

  clearInterval(dashboardPollingTimer);
  dashboardPollingTimer = null;
}

function handleDashboardVisibilityChange(): void {
  if (document.hidden) {
    stopDashboardPolling();
    return;
  }

  void refreshDashboardSilently();
  startDashboardPolling();
}

onMounted(() => {
  void loadDashboard();
  startDashboardPolling();

  document.addEventListener(
    "visibilitychange",
    handleDashboardVisibilityChange,
  );
});

onBeforeUnmount(() => {
  stopDashboardPolling();

  document.removeEventListener(
    "visibilitychange",
    handleDashboardVisibilityChange,
  );
});
</script>

<template>
  <main class="dp-page">
    <!-- ambient grid -->
    <div aria-hidden="true" class="dp-grid" />
    <div aria-hidden="true" class="dp-glow" />

    <div class="dp-container">
      <!-- Header -->
      <section class="dp-header">
        <div class="dp-header-copy">
          <p class="dp-eyebrow">
            <span class="dp-eyebrow-dot" />
            Deployment dashboard
          </p>
          <h1 class="dp-title">Your projects</h1>
          <p class="dp-subtitle">
            Deploy repositories, monitor build progress, and manage running
            applications from one place.
          </p>
        </div>

        <div class="dp-actions">
          <button
            :disabled="refreshing || initialLoading"
            class="dp-btn dp-btn-ghost"
            type="button"
            @click="loadDashboard(true)"
          >
            <Icon v-if="!refreshing" class="dp-icon" icon="mdi:refresh" />
            <span v-else class="dp-spinner dp-spinner-sm" />
            {{ refreshing ? "Refreshing…" : "Refresh" }}
          </button>

          <NuxtLink class="dp-btn dp-btn-primary" to="/new">
            <Icon class="dp-icon" icon="mdi:plus" />
            New project
          </NuxtLink>
        </div>
      </section>

      <!-- Initial Dashboard Loading -->
      <section v-if="initialLoading" class="dp-loading">
        <div class="dp-spinner-wrap">
          <div class="dp-spinner-ring" />
          <span class="dp-spinner-mark">D</span>
        </div>
        <h2 class="dp-loading-title">Loading your dashboard</h2>
        <p class="dp-loading-copy">
          Connecting to DevPilot and retrieving your projects…
        </p>
      </section>

      <template v-else>
        <!-- Stats -->
        <section
          v-motion
          :enter="{ opacity: 1, y: 0 }"
          :initial="{ opacity: 0, y: 16 }"
          class="dp-stats"
        >
          <div class="dp-stat">
            <div class="dp-stat-head">
              <span
                :class="apiConnected ? 'is-good' : 'is-bad'"
                class="dp-status-dot"
              />
              <p class="dp-stat-label">API status</p>
            </div>
            <p
              :class="apiConnected ? 'text-good' : 'text-bad'"
              class="dp-stat-value"
            >
              {{ apiConnected ? "Connected" : "Offline" }}
            </p>
          </div>

          <div class="dp-stat">
            <div class="dp-stat-head">
              <Icon class="dp-stat-icon" icon="mdi:folder-outline" />
              <p class="dp-stat-label">Projects</p>
            </div>
            <p class="dp-stat-value">{{ projects.length }}</p>
          </div>

          <div class="dp-stat">
            <div class="dp-stat-head">
              <Icon class="dp-stat-icon" icon="mdi:rocket-launch-outline" />
              <p class="dp-stat-label">Running deployments</p>
            </div>
            <p class="dp-stat-value text-good">
              {{
                projects.filter((p) => p.deployments[0]?.status === "READY")
                  .length
              }}
            </p>
          </div>
        </section>

        <!-- Error -->
        <div v-if="errorMessage" class="dp-error">
          <Icon class="dp-error-icon" icon="mdi:alert-circle-outline" />
          <div>
            <p class="dp-error-title">Dashboard request failed</p>
            <p class="dp-error-copy">{{ errorMessage }}</p>
          </div>
        </div>

        <!-- Project List -->
        <section class="dp-projects">
          <div v-if="projects.length === 0 && !errorMessage" class="dp-empty">
            <div class="dp-empty-icon">
              <Icon icon="mdi:folder-open-outline" />
            </div>
            <h2 class="dp-empty-title">No projects found</h2>
            <p class="dp-empty-copy">
              Create your first project to begin deploying.
            </p>
            <NuxtLink class="dp-btn dp-btn-primary dp-empty-cta" to="/new">
              <Icon class="dp-icon" icon="mdi:plus" />
              New project
            </NuxtLink>
          </div>

          <div v-else class="dp-grid-cards">
            <article
              v-for="(project, idx) in projects"
              :key="project.id"
              v-motion
              :delay="idx * 60"
              :enter="{ opacity: 1, y: 0 }"
              :initial="{ opacity: 0, y: 20 }"
              class="dp-card"
            >
              <div class="dp-card-top">
                <div class="dp-card-heading">
                  <NuxtLink
                    :to="`/projects/${project.id}`"
                    class="dp-card-title"
                  >
                    {{ project.name }}
                  </NuxtLink>
                  <p class="dp-card-repo">
                    <Icon
                      class="dp-card-repo-icon"
                      icon="mdi:source-repository"
                    />
                    {{ project.repositoryOwner }}/{{ project.repositoryName }}
                  </p>
                </div>
                <StatusBadge :status="project.deployments[0]?.status" />
              </div>

              <div class="dp-card-meta">
                <div class="dp-meta-item">
                  <p class="dp-meta-label">Branch</p>
                  <p class="dp-meta-value">
                    <Icon class="dp-meta-icon" icon="mdi:source-branch" />
                    {{ project.productionBranch }}
                  </p>
                </div>
                <div class="dp-meta-item">
                  <p class="dp-meta-label">Root dir</p>
                  <p class="dp-meta-value dp-truncate">
                    {{ project.rootDirectory }}
                  </p>
                </div>
                <div class="dp-meta-item">
                  <p class="dp-meta-label">Deployments</p>
                  <p class="dp-meta-value">
                    {{ project._count.deployments }}
                  </p>
                </div>
                <div class="dp-meta-item">
                  <p class="dp-meta-label">Updated</p>
                  <p class="dp-meta-value">
                    {{ formatDate(project.updatedAt) }}
                  </p>
                </div>
              </div>

              <div
                v-if="project.deployments[0]?.commitMessage"
                class="dp-commit"
              >
                <p class="dp-commit-label">Latest commit</p>
                <p class="dp-commit-value">
                  {{ project.deployments[0].commitMessage }}
                </p>
              </div>

              <div class="dp-card-footer">
                <div class="dp-footer-left">
                  <a
                    :href="project.repositoryUrl"
                    aria-label="Open repository"
                    class="dp-icon-action dp-icon-action-ghost"
                    rel="noopener noreferrer"
                    target="_blank"
                    title="Repository"
                  >
                    <Icon class="dp-icon-sm" icon="mdi:github" />
                  </a>

                  <NuxtLink
                    :to="`/projects/${project.id}`"
                    aria-label="Open project"
                    class="dp-icon-action dp-icon-action-primary"
                    title="Open project"
                  >
                    <Icon class="dp-icon-sm" icon="mdi:arrow-top-right" />
                  </NuxtLink>
                </div>

                <button
                  :aria-label="
                    deletingProjectId === project.id
                      ? 'Deleting project'
                      : 'Delete project'
                  "
                  :disabled="deletingProjectId !== null"
                  class="dp-icon-action dp-icon-action-danger"
                  title="Delete project"
                  type="button"
                  @click="requestDeleteProject(project)"
                >
                  <Icon
                    v-if="deletingProjectId !== project.id"
                    class="dp-icon-sm"
                    icon="mdi:trash-can-outline"
                  />
                  <span v-else class="dp-spinner dp-spinner-sm" />
                </button>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>

    <!-- Delete project confirmation -->
    <Teleport to="body">
      <div
        v-if="projectPendingDelete"
        class="dp-modal-overlay"
        @click.self="!deletingProjectId && (projectPendingDelete = null)"
      >
        <section class="dp-modal">
          <div class="dp-modal-icon">
            <Icon class="dp-icon" icon="mdi:trash-can-outline" />
          </div>

          <h2 class="dp-modal-title">
            Delete {{ projectPendingDelete.name }}?
          </h2>

          <p class="dp-modal-copy">
            This permanently deletes the project and all its deployments.
            Related Docker containers, images, and logs will also be removed.
            This cannot be undone.
          </p>

          <div class="dp-modal-actions">
            <button
              :disabled="deletingProjectId !== null"
              class="dp-btn dp-btn-ghost"
              type="button"
              @click="projectPendingDelete = null"
            >
              Cancel
            </button>

            <button
              :disabled="deletingProjectId !== null"
              class="dp-btn dp-btn-danger"
              type="button"
              @click="deleteProject"
            >
              <span
                v-if="deletingProjectId !== null"
                class="dp-spinner dp-spinner-sm dp-spinner-on-danger"
              />
              {{ deletingProjectId !== null ? "Deleting…" : "Delete project" }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
/* ===== Tokens ===== */
.dp-page {
  --bg: #020617;
  --surface: rgba(15, 23, 42, 0.6);
  --surface-2: rgba(30, 41, 59, 0.7);
  --border: #1e293b;
  --border-hover: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-faint: #64748b;
  --accent: #22d3ee;
  --accent-dim: rgba(34, 211, 238, 0.12);
  --good: #34d399;
  --good-dim: rgba(52, 211, 153, 0.12);
  --bad: #fb7185;
  --bad-dim: rgba(251, 113, 133, 0.12);

  position: relative;
  min-height: 100vh;
  background: radial-gradient(
      ellipse 120% 60% at 50% -10%,
      #0c1a3d 0%,
      #020617 55%
    ),
    var(--bg);
  color: var(--text);
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  overflow-x: hidden;
}

/* ===== Ambient background ===== */
.dp-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(
      to right,
      rgba(56, 189, 248, 0.06) 1px,
      transparent 1px
    ),
    linear-gradient(to bottom, rgba(56, 189, 248, 0.06) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(
    ellipse 80% 50% at 50% 0%,
    black 40%,
    transparent 100%
  );
  pointer-events: none;
}

.dp-glow {
  position: absolute;
  top: -240px;
  left: 50%;
  transform: translateX(-50%);
  width: 1000px;
  height: 560px;
  background: radial-gradient(
    ellipse at center,
    rgba(34, 211, 238, 0.18) 0%,
    rgba(59, 130, 246, 0.08) 45%,
    rgba(34, 211, 238, 0) 75%
  );
  filter: blur(10px);
  pointer-events: none;
}

.dp-container {
  position: relative;
  max-width: 84rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 6rem;
}

/* ===== Header ===== */
.dp-header {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding-bottom: 2.5rem;
  border-bottom: 1px solid var(--border);
}

.dp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 0 18px var(--accent-dim);
}

.dp-eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--good);
  box-shadow: 0 0 0 3px var(--good-dim);
}

.dp-title {
  margin-top: 0.75rem;
  font-size: clamp(2.25rem, 4vw, 3rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #ffffff;
}

.dp-subtitle {
  margin-top: 0.75rem;
  max-width: 40rem;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-dim);
}

.dp-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

@media (min-width: 640px) {
  .dp-header {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
}

/* ===== Buttons ===== */
.dp-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 8px;
  padding: 0.6rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
  white-space: nowrap;
}

.dp-btn:active {
  transform: scale(0.98);
}

.dp-btn-primary {
  background: var(--accent);
  color: #04121a;
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.4),
    0 8px 24px -8px rgba(34, 211, 238, 0.45);
}

.dp-btn-primary:hover {
  background: #67e8f9;
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.6),
    0 10px 28px -6px rgba(34, 211, 238, 0.6);
}

.dp-btn-ghost {
  background: var(--surface);
  color: var(--text);
  border-color: var(--border);
  backdrop-filter: blur(6px);
}

.dp-btn-ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface-2);
}

.dp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dp-btn-sm {
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
}

/* Cluster that holds Repository + Open project icon buttons on the left */
.dp-footer-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

/* Unified icon-only action button used for repository / open / delete */
.dp-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
}

.dp-icon-action:active:not(:disabled) {
  transform: scale(0.94);
}

.dp-icon-action-ghost:hover {
  border-color: var(--border-hover);
  color: #ffffff;
  background: rgba(148, 163, 184, 0.14);
}

.dp-icon-action-primary {
  border-color: rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.1);
  color: var(--accent);
}

.dp-icon-action-primary:hover {
  border-color: var(--accent);
  background: var(--accent);
  color: #04121a;
  box-shadow: 0 0 16px -2px rgba(34, 211, 238, 0.55);
}

.dp-icon-action-danger {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(244, 63, 94, 0.08);
  color: #fda4af;
}

.dp-icon-action-danger:hover:not(:disabled) {
  border-color: rgba(244, 63, 94, 0.7);
  background: rgba(244, 63, 94, 0.22);
  box-shadow: 0 0 16px -2px rgba(244, 63, 94, 0.5);
}

.dp-icon-action-danger:disabled,
.dp-icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.dp-icon-action-danger .dp-spinner-sm {
  border-color: rgba(253, 164, 175, 0.3);
  border-top-color: #fda4af;
}

.dp-icon {
  width: 1rem;
  height: 1rem;
}

.dp-icon-sm {
  width: 1.05rem;
  height: 1.05rem;
  display: inline;
  vertical-align: middle;
}

/* ===== Spinners ===== */
.dp-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 2px solid rgba(34, 211, 238, 0.25);
  border-top-color: var(--accent);
  animation: dp-spin 0.7s linear infinite;
}

.dp-spinner-sm {
  width: 0.9rem;
  height: 0.9rem;
}

.dp-delete-fab .dp-spinner-sm {
  border-color: rgba(253, 164, 175, 0.3);
  border-top-color: #fda4af;
}

@keyframes dp-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Initial loading state ===== */
.dp-loading {
  display: flex;
  min-height: 420px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.dp-spinner-wrap {
  position: relative;
  display: flex;
  height: 3.5rem;
  width: 3.5rem;
  align-items: center;
  justify-content: center;
}

.dp-spinner-ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  animation: dp-spin 0.9s linear infinite;
}

.dp-spinner-mark {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent);
  text-shadow: 0 0 12px var(--accent-dim);
}

.dp-loading-title {
  margin-top: 1.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #ffffff;
}

.dp-loading-copy {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-faint);
}

/* ===== Stats ===== */
.dp-stats {
  margin-top: 2.5rem;
  display: grid;
  gap: 1rem;
}

@media (min-width: 640px) {
  .dp-stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

.dp-stat {
  border-radius: 25px;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 1.25rem 1.4rem;
  transition: border-color 0.15s ease;
}

.dp-stat:hover {
  border-color: rgba(34, 211, 238, 0.4);
  box-shadow: 0 0 20px -6px rgba(34, 211, 238, 0.25);
}

.dp-stat-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dp-stat-icon {
  width: 0.95rem;
  height: 0.95rem;
  color: var(--text-faint);
}

.dp-stat-label {
  font-size: 0.8rem;
  color: var(--text-faint);
}

.dp-stat-value {
  margin-top: 0.6rem;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #ffffff;
}

.dp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.dp-status-dot.is-good {
  background: var(--good);
  box-shadow: 0 0 0 3px var(--good-dim);
}

.dp-status-dot.is-bad {
  background: var(--bad);
  box-shadow: 0 0 0 3px var(--bad-dim);
}

.text-good {
  color: var(--good);
}

.text-bad {
  color: var(--bad);
}

/* ===== Error ===== */
.dp-error {
  margin-top: 2rem;
  display: flex;
  gap: 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(242, 73, 92, 0.25);
  background: var(--bad-dim);
  padding: 1.1rem 1.25rem;
}

.dp-error-icon {
  margin-top: 0.15rem;
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
  color: var(--bad);
}

.dp-error-title {
  font-weight: 600;
  color: #ffd7db;
}

.dp-error-copy {
  margin-top: 0.2rem;
  font-size: 0.85rem;
  color: #f3a9b0;
}

/* ===== Projects ===== */
.dp-projects {
  margin-top: 2.75rem;
}

.dp-empty {
  border-radius: 16px;
  border: 1px dashed var(--border);
  background: var(--surface);
  padding: 4.5rem 1.5rem;
  text-align: center;
}

.dp-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 1.4rem;
  margin-bottom: 1.25rem;
}

.dp-empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
}

.dp-empty-copy {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: var(--text-faint);
}

.dp-empty-cta {
  margin-top: 1.5rem;
}

.dp-grid-cards {
  display: grid;
  gap: 1.1rem;
}

@media (min-width: 1024px) {
  .dp-grid-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ===== Project card ===== */
.dp-card {
  position: relative;
  border-radius: 25px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, var(--surface), #060606);
  padding: 1.5rem;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.dp-card:hover {
  border-color: rgba(34, 211, 238, 0.45);
  transform: translateY(-2px);
  box-shadow:
    0 12px 30px -12px rgba(0, 0, 0, 0.6),
    0 0 24px -8px rgba(34, 211, 238, 0.35);
}

.dp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.dp-card-heading {
  min-width: 0;
}

.dp-card-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.01em;
  transition: color 0.15s ease;
}

.dp-card:hover .dp-card-title {
  color: var(--accent);
}

.dp-card-repo {
  margin-top: 0.3rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.83rem;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-card-repo-icon {
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
}

.dp-card-meta {
  margin-top: 1.5rem;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.015);
  padding: 1rem 1.1rem;
  font-size: 0.85rem;
}

.dp-meta-label {
  color: var(--text-faint);
  font-size: 0.75rem;
}

.dp-meta-value {
  margin-top: 0.3rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 500;
  color: var(--text);
}

.dp-meta-icon {
  width: 0.8rem;
  height: 0.8rem;
  color: var(--text-faint);
}

.dp-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-commit {
  margin-top: 1.25rem;
}

.dp-commit-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.dp-commit-value {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-card-footer {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 1.15rem;
}

/* ===== Delete confirmation modal =====
   Teleported to <body>, so it sits outside .dp-page in the DOM and
   cannot inherit its CSS custom properties — redeclare what's needed. */
.dp-modal-overlay {
  --surface: rgba(15, 23, 42, 0.6);
  --surface-2: rgba(30, 41, 59, 0.7);
  --border: #1e293b;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --accent: #22d3ee;
  --bad: #fb7185;
  --bad-dim: rgba(251, 113, 133, 0.12);

  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(8px);
}

.dp-modal {
  width: 100%;
  max-width: 26rem;
  border-radius: 20px;
  border: 1px solid rgba(251, 113, 133, 0.3);
  background: #0b1120;
  padding: 1.75rem;
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
}

.dp-modal-icon {
  display: flex;
  height: 3rem;
  width: 3rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--bad-dim);
  color: #fda4af;
}

.dp-modal-title {
  margin-top: 1.25rem;
  font-size: 1.2rem;
  font-weight: 700;
  color: #ffffff;
}

.dp-modal-copy {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-dim);
}

.dp-modal-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.dp-btn-danger {
  background: #f43f5e;
  color: #ffffff;
  border-color: transparent;
}

.dp-btn-danger:hover:not(:disabled) {
  background: #fb7185;
}

.dp-spinner-on-danger {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
}
</style>
